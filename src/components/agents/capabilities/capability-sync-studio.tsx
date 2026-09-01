import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Copy,
  Eye,
  FileWarning,
  PlugZap,
  RefreshCw,
  Sparkles,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  Webhook,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityTargetPicker, scopeLabel } from "@/components/agents/capabilities/capability-targets";
import {
  CapabilityEmpty,
  CapabilityError,
  CapabilityLoading,
  ProgressiveCapabilityList,
} from "@/components/agents/capabilities/capability-ui";
import { SpinIcon } from "@/components/motion/kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { NativeSelect } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type {
  CapabilityItem,
  CapabilityItemStatus,
  CapabilityKind,
  CapabilityOpResult,
  CapabilityPlanEntry,
  CapabilityScope,
  CapabilityTargetRef,
} from "@/lib/agents/capability-hub";
import {
  CAPABILITY_KINDS,
  CAPABILITY_SCOPES,
  itemRef,
  itemStatusSummary,
  scopeInfo,
  summarizeResults,
  targetKey,
  useCapabilityHubStore,
} from "@/lib/agents/capability-hub";
import { cn } from "@/lib/utils";

const KIND_ICONS: Record<CapabilityKind, typeof Sparkles> = {
  skill: Sparkles,
  command: SquareTerminal,
  agent: Bot,
  mcp: PlugZap,
  hook: Webhook,
};

const STATUS_TONE: Record<CapabilityItemStatus, string> = {
  missing: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  different: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  same: "border-border/60 text-muted-foreground",
  unsupported: "border-destructive/30 text-destructive",
};

const PLAN_TONE: Record<string, string> = {
  create: STATUS_TONE.missing,
  update: STATUS_TONE.different,
  same: STATUS_TONE.same,
  extra: "border-sky-500/30 text-sky-600 dark:text-sky-400",
  unsupported: STATUS_TONE.unsupported,
};

function relativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 30) return `vor ${days} Tagen`;
  return new Date(timestamp).toLocaleDateString();
}

function planKey(entry: CapabilityPlanEntry): string {
  return `${entry.targetCli}:${entry.targetScope}:${entry.kind}:${entry.rel}:${entry.action}`;
}

export function CapabilitySyncStudio({ path, query }: { path: string; query: string }) {
  const { t } = useTranslation();
  const load = useCapabilityHubStore((state) => state.load);
  const copy = useCapabilityHubStore((state) => state.copy);
  const remove = useCapabilityHubStore((state) => state.remove);
  const plan = useCapabilityHubStore((state) => state.plan);
  const apply = useCapabilityHubStore((state) => state.apply);
  const loading = useCapabilityHubStore((state) => state.loading);
  const busy = useCapabilityHubStore((state) => state.busy);
  const error = useCapabilityHubStore((state) => state.error);
  const inventory = useCapabilityHubStore((state) => state.inventory);

  const [source, setSource] = useState<CapabilityTargetRef | null>(null);
  const [targets, setTargets] = useState<CapabilityTargetRef[]>([]);
  const [kinds, setKinds] = useState<CapabilityKind[]>([...CAPABILITY_KINDS]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [deleteExtras, setDeleteExtras] = useState(false);
  const [planEntries, setPlanEntries] = useState<CapabilityPlanEntry[] | null>(null);
  const [planSelection, setPlanSelection] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<CapabilityOpResult[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void load(path);
  }, [load, path]);

  // Vorbelegung: die Ebene mit den meisten Einträgen ist fast immer gemeint.
  useEffect(() => {
    if (source || !inventory.targets.length) return;
    const fullest = inventory.targets
      .flatMap((target) => target.scopes.map((scope) => ({ cli: target.cli, scope: scope.scope, count: scope.itemCount })))
      .sort((a, b) => b.count - a.count)[0];
    if (fullest) setSource({ cli: fullest.cli, scope: fullest.scope });
  }, [inventory.targets, source]);

  const sourceInfo = inventory.targets.find((entry) => entry.cli === source?.cli);
  const sourceLabel = source
    ? `${sourceInfo?.label ?? source.cli} · ${scopeLabel(source.scope, t)}`
    : "";
  const targetLabel = targets.length === 1
    ? `${inventory.targets.find((entry) => entry.cli === targets[0].cli)?.label ?? targets[0].cli} · ${scopeLabel(targets[0].scope, t)}`
    : t("agentCapabilities.hub.targetCount", { count: targets.length });

  const sourceItems = useMemo(() => {
    if (!source) return [];
    const normalized = query.trim().toLocaleLowerCase();
    return inventory.items.filter((item) => {
      if (item.cli !== source.cli || item.scope !== source.scope) return false;
      if (!kinds.includes(item.kind)) return false;
      if (!normalized) return true;
      return `${item.name} ${item.description} ${item.rel}`.toLocaleLowerCase().includes(normalized);
    });
  }, [inventory.items, kinds, query, source]);

  const selectedItems = useMemo(
    () => sourceItems.filter((item) => selected.has(item.id)),
    [selected, sourceItems],
  );

  const toggleTarget = useCallback((target: CapabilityTargetRef) => {
    setTargets((current) =>
      current.some((entry) => targetKey(entry) === targetKey(target))
        ? current.filter((entry) => targetKey(entry) !== targetKey(target))
        : [...current, target],
    );
  }, []);

  const showResults = useCallback(
    (outcome: CapabilityOpResult[], successKey: string) => {
      setResults(outcome);
      const totals = summarizeResults(outcome);
      if (totals.failed) {
        toast.error(t("agentCapabilities.hub.resultWithErrors", { ok: totals.ok, failed: totals.failed }));
      } else {
        toast.success(t(successKey, { count: totals.ok }));
      }
    },
    [t],
  );

  const runCopy = useCallback(async () => {
    if (!selectedItems.length || !targets.length) return;
    try {
      const outcome = await copy(selectedItems.map(itemRef), targets, overwrite);
      setSelected(new Set());
      showResults(outcome, "agentCapabilities.hub.copied");
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  }, [copy, overwrite, selectedItems, showResults, targets]);

  const runDelete = useCallback(async () => {
    if (!selectedItems.length) return;
    try {
      const outcome = await remove(selectedItems.map(itemRef));
      setSelected(new Set());
      showResults(outcome, "agentCapabilities.hub.deleted");
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  }, [remove, selectedItems, showResults]);

  const runPlan = useCallback(async () => {
    if (!source || !targets.length) return;
    try {
      const entries = await plan(source, targets, kinds, true);
      setPlanEntries(entries);
      setPlanSelection(
        new Set(
          entries
            .filter((entry) => entry.action === "create" || entry.action === "update")
            .map(planKey),
        ),
      );
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  }, [kinds, plan, source, targets]);

  const runApply = useCallback(async () => {
    if (!planEntries) return;
    const chosen = planEntries.filter((entry) => planSelection.has(planKey(entry)));
    if (!chosen.length) return;
    try {
      const outcome = await apply(chosen, deleteExtras);
      setPlanEntries(null);
      showResults(outcome, "agentCapabilities.hub.synced");
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  }, [apply, deleteExtras, planEntries, planSelection, showResults]);

  if (loading && !inventory.targets.length) {
    return <CapabilityLoading label={t("agentCapabilities.hub.loading")} />;
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-5">
        {error ? <CapabilityError message={error} /> : null}

        {/* Richtung: von einer Quelle in ein oder mehrere Ziele. */}
        <section className="ag-card overflow-hidden">
          <header className="flex items-start gap-2 border-b border-[var(--ag-line)] px-4 py-2.5">
            <div className="mr-auto min-w-0">
              <p className="text-[12px] font-semibold tracking-tight">
                {t("agentCapabilities.hub.title")}
              </p>
              <p className="ag-muted mt-0.5 text-[10px] leading-4">
                {t("agentCapabilities.hub.explainer")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ag-icon-btn rounded-full"
              disabled={loading}
              onClick={() => void load(path, true)}
              title={t("common.refresh")}
              aria-label={t("common.refresh")}
            >
              <SpinIcon icon={RefreshCw} active={loading} className="size-4" />
            </Button>
          </header>

          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,20rem)_auto_minmax(0,1fr)] lg:items-start">
            <div>
              <p className="ag-label mb-2">{t("agentCapabilities.hub.from")}</p>
              <div className="flex flex-wrap gap-2">
                <NativeSelect
                  value={source?.cli ?? ""}
                  onChange={(event) => {
                    const cli = event.target.value;
                    setSource((current) => ({ cli, scope: current?.scope ?? "user" }));
                    setSelected(new Set());
                  }}
                  className="h-8 w-40 text-[11px]"
                  aria-label={t("agentCapabilities.hub.cli")}
                >
                  {inventory.targets.map((target) => (
                    <option key={target.cli} value={target.cli}>
                      {target.label}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  value={source?.scope ?? "user"}
                  onChange={(event) => {
                    const scope = event.target.value as CapabilityScope;
                    setSource((current) => ({ cli: current?.cli ?? inventory.targets[0]?.cli ?? "claude", scope }));
                    setSelected(new Set());
                  }}
                  className="h-8 w-32 text-[11px]"
                  aria-label={t("agentCapabilities.hub.level")}
                >
                  {CAPABILITY_SCOPES.map((scope) => (
                    <option key={scope} value={scope}>
                      {scopeLabel(scope, t)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <p className="ag-faint mt-2 text-[10px]">
                {t("agentCapabilities.hub.itemsInSource", { count: sourceItems.length })}
              </p>
              {source && scopeInfo(sourceInfo, source.scope)?.root ? (
                <p className="ag-faint mt-0.5 break-all font-mono text-[9px]">
                  {scopeInfo(sourceInfo, source.scope)?.root}
                </p>
              ) : null}
              <ul className="mt-3 space-y-1">
                {CAPABILITY_KINDS.map((kind) => {
                  const Icon = KIND_ICONS[kind];
                  const count = sourceItems.filter((item) => item.kind === kind).length;
                  return (
                    <li
                      key={kind}
                      className={cn(
                        "flex items-center gap-2 text-[10px]",
                        count ? "text-[var(--ag-text-2)]" : "opacity-40",
                      )}
                    >
                      <Icon className="size-3 shrink-0" />
                      <span className="flex-1 truncate">{t(`agentCapabilities.hub.kinds.${kind}`)}</span>
                      <span className="tabular-nums">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="hidden shrink-0 items-center justify-center self-center lg:flex">
              <span className="ag-inset grid size-7 place-items-center rounded-full">
                <ArrowRight className="size-3.5" />
              </span>
            </div>

            <div>
              <p className="ag-label mb-2">{t("agentCapabilities.hub.to")}</p>
              <CapabilityTargetPicker
                targets={inventory.targets}
                selected={targets}
                onToggle={toggleTarget}
              />
              <p className="ag-faint mt-2 text-[10px]">
                {targets.length
                  ? t("agentCapabilities.hub.toHint")
                  : t("agentCapabilities.hub.noTargetSelected")}
              </p>
            </div>
          </div>
        </section>

        {/* Auswahl: was übernommen werden soll. */}
        <section className="ag-card">
          <header className="flex flex-wrap items-center gap-2 border-b border-[var(--ag-line)] px-4 py-2.5">
            <div className="mr-auto flex flex-wrap items-center gap-1">
              {CAPABILITY_KINDS.map((kind) => {
                const Icon = KIND_ICONS[kind];
                const active = kinds.includes(kind);
                const count = sourceItems.filter((item) => item.kind === kind).length;
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setKinds((current) =>
                        current.includes(kind) ? current.filter((entry) => entry !== kind) : [...current, kind],
                      )
                    }
                    className={cn(
                      "ag-pill h-7 gap-1.5 px-2 text-[10px] font-medium",
                      active && "bg-[var(--ag-selected)] text-[var(--ag-text)]",
                    )}
                  >
                    <Icon className="size-3" />
                    {t(`agentCapabilities.hub.kinds.${kind}`)}
                    {active ? <span className="ag-faint tabular-nums">{count}</span> : null}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={() =>
                setSelected((current) =>
                  current.size === sourceItems.length ? new Set() : new Set(sourceItems.map((item) => item.id)),
                )
              }
            >
              {selected.size === sourceItems.length && sourceItems.length
                ? t("agentCapabilities.hub.selectNone")
                : t("agentCapabilities.hub.selectAll")}
            </Button>
          </header>

          <div className="p-3">
            {sourceItems.length ? (
              <div className="grid gap-1.5 sm:grid-cols-2">
                <ProgressiveCapabilityList
                  items={sourceItems}
                  getKey={(item) => item.id}
                  resetKey={`${source ? targetKey(source) : "none"}:${kinds.join(",")}:${query}:${targets.map(targetKey).join(",")}`}
                  moreLabel={(count) => t("agentCapabilities.showMore", { count })}
                  renderItem={(item: CapabilityItem) => {
                    const Icon = KIND_ICONS[item.kind];
                    const checked = selected.has(item.id);
                    const totals = itemStatusSummary(item, targets, inventory.targets, inventory.items);
                    return (
                      <label
                        className={cn(
                          "ag-card flex cursor-pointer items-start gap-2.5 p-3 transition-colors",
                          checked && "bg-[var(--ag-selected)]",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                          className="mt-0.5"
                        />
                        <Icon className="ag-faint mt-0.5 size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[12px] font-medium">{item.name}</span>
                            {item.isDirectory ? (
                              <Badge variant="outline" className="h-4 rounded px-1 text-[8px]">
                                {t("agentCapabilities.hub.files", { count: item.fileCount })}
                              </Badge>
                            ) : null}
                            {(["missing", "different", "same", "unsupported"] as const)
                              .filter((status) => totals[status] > 0)
                              .map((status) => (
                                <Badge
                                  key={status}
                                  variant="outline"
                                  className={cn("h-4 rounded px-1 text-[8px]", STATUS_TONE[status])}
                                >
                                  {targets.length > 1
                                    ? t(`agentCapabilities.hub.statusCount.${status}`, { count: totals[status] })
                                    : t(`agentCapabilities.hub.status.${status}`)}
                                </Badge>
                              ))}
                          </span>
                          <span className="ag-muted mt-0.5 line-clamp-2 block text-[10px] leading-4">
                            {item.description || t("agentCapabilities.hub.noDescription")}
                          </span>
                          <span className="ag-faint mt-1 block truncate font-mono text-[9px]">
                            {item.rel} · {relativeTime(item.updatedAtMs)}
                          </span>
                        </span>
                      </label>
                    );
                  }}
                />
              </div>
            ) : (
              <CapabilityEmpty
                title={t("agentCapabilities.hub.emptyTitle")}
                description={t("agentCapabilities.hub.emptyDescription")}
              />
            )}
          </div>
        </section>

        {/* Aktionen: jede Schaltfläche sagt im Klartext, was sie tut. */}
        <div className="ag-card sticky bottom-0 space-y-2 p-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !selected.size || !targets.length}
              onClick={() => void runCopy()}
            >
              <Copy className="size-3.5" />
              {selected.size && targets.length
                ? t("agentCapabilities.hub.copyAction", { count: selected.size, target: targetLabel })
                : t("agentCapabilities.hub.copy")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !targets.length}
              onClick={() => void runPlan()}
            >
              <Eye className="size-3.5" />
              {t("agentCapabilities.hub.preview")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy || !selected.size}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" />
              {t("agentCapabilities.hub.deleteFromSource", { source: sourceLabel })}
            </Button>
            <label className="ml-auto flex items-center gap-2 text-[11px]">
              <Switch checked={overwrite} onCheckedChange={setOverwrite} />
              {t("agentCapabilities.hub.overwrite")}
            </label>
          </div>
          <p className="ag-faint text-[10px] leading-4">
            {overwrite
              ? t("agentCapabilities.hub.overwriteOnHint")
              : t("agentCapabilities.hub.overwriteOffHint")}
          </p>
        </div>

        {results.length ? (
          <section className="ag-card p-4">
            <p className="ag-label mb-2">{t("agentCapabilities.hub.results")}</p>
            <ul className="space-y-1">
              {results.map((entry, index) => (
                <li key={`${entry.kind}:${entry.name}:${entry.target}:${index}`} className="flex items-start gap-2 text-[11px]">
                  {entry.status === "error" ? (
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  ) : entry.status === "skipped" || entry.status === "unsupported" ? (
                    <FileWarning className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{entry.name}</span>
                    <span className="ag-faint"> → {entry.target}</span>
                    <span className="ag-muted block break-all text-[10px]">{entry.message}</span>
                    {entry.backup ? (
                      <span className="ag-faint block break-all font-mono text-[9px]">
                        {t("agentCapabilities.hub.backup", { path: entry.backup })}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <Dialog open={Boolean(planEntries)} onOpenChange={(open) => !open && setPlanEntries(null)}>
        <DialogContent className="flex h-[min(88vh,820px)] w-full flex-col gap-3 overflow-hidden sm:max-w-[min(96vw,980px)]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("agentCapabilities.hub.planTitle")}</DialogTitle>
            <DialogDescription>{t("agentCapabilities.hub.planDescription")}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 pr-2">
            <div className="space-y-1">
              {(planEntries ?? []).map((entry) => {
                const key = planKey(entry);
                const selectable = entry.action !== "same" && entry.action !== "unsupported";
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2",
                      selectable ? "cursor-pointer hover:bg-[var(--ag-hover)]" : "opacity-60",
                    )}
                  >
                    <Checkbox
                      checked={planSelection.has(key)}
                      disabled={!selectable}
                      onCheckedChange={() =>
                        setPlanSelection((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                    />
                    <Badge variant="outline" className={cn("h-5 shrink-0 rounded px-1.5 text-[9px]", PLAN_TONE[entry.action])}>
                      {t(`agentCapabilities.hub.actions.${entry.action}`)}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium">{entry.name}</span>
                      <span className="ag-faint block truncate text-[10px]">
                        {t(`agentCapabilities.hub.kinds.${entry.kind}`)} · {entry.targetCli} · {scopeLabel(entry.targetScope, t)} · {entry.detail}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
          <DialogFooter className="shrink-0 flex-col items-stretch gap-2 border-t border-[var(--ag-line)] pt-3 sm:flex-row sm:items-center">
            <label className="mr-auto flex items-center gap-2 text-[11px]">
              <Switch checked={deleteExtras} onCheckedChange={setDeleteExtras} />
              {t("agentCapabilities.hub.deleteExtras")}
            </label>
            <Button type="button" variant="outline" onClick={() => setPlanEntries(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={busy || !planSelection.size} onClick={() => void runApply()}>
              {t("agentCapabilities.hub.applyPlan", { count: planSelection.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("agentCapabilities.hub.deleteTitle", { count: selected.size })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("agentCapabilities.hub.deleteDescription", { source: sourceLabel })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDelete(false);
                void runDelete();
              }}
            >
              {t("agentCapabilities.hub.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  );
}
