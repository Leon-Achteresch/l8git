import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Copy,
  Eye,
  FileWarning,
  PlugZap,
  Sparkles,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  Webhook,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGuideChoice } from "@/components/agents/capabilities/capability-guide-choice";
import { CapabilityGuideSteps } from "@/components/agents/capabilities/capability-guide-steps";
import { CapabilityCliMark } from "@/components/agents/capabilities/capability-cli-mark";
import { scopeLabel } from "@/components/agents/capabilities/capability-targets";
import {
  CapabilityEmpty,
  CapabilityError,
  CapabilityLoading,
  ProgressiveCapabilityList,
} from "@/components/agents/capabilities/capability-ui";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type {
  CapabilityItem,
  CapabilityItemStatus,
  CapabilityKind,
  CapabilityOpResult,
  CapabilityPlanEntry,
  CapabilityTargetRef,
} from "@/lib/agents/capability-hub";
import {
  CAPABILITY_KINDS,
  CAPABILITY_SCOPES,
  coverageSummary,
  defaultTargets,
  gapsToward,
  itemRef,
  itemStatusSummary,
  kindCountsForCli,
  preferredWritableScope,
  scopeInfo,
  summarizeResults,
  targetKey,
  targetWritable,
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

const PLAN_TONE: Record<string, string> = {
  create: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  update: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  same: "border-border/60 text-muted-foreground",
  extra: "border-sky-500/30 text-sky-600 dark:text-sky-400",
  unsupported: "border-destructive/30 text-destructive",
};

function matchesGaps(totals: Record<CapabilityItemStatus, number>, gapsOnly: boolean): boolean {
  if (!gapsOnly) return true;
  return totals.missing > 0 || totals.different > 0;
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

  const [step, setStep] = useState(0);
  const [source, setSource] = useState<CapabilityTargetRef | null>(null);
  const [targets, setTargets] = useState<CapabilityTargetRef[]>([]);
  const [kinds, setKinds] = useState<CapabilityKind[]>([...CAPABILITY_KINDS]);
  const [gapsOnly, setGapsOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [deleteExtras, setDeleteExtras] = useState(false);
  const [planEntries, setPlanEntries] = useState<CapabilityPlanEntry[] | null>(null);
  const [planSelection, setPlanSelection] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<CapabilityOpResult[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const targetsTouched = useRef(false);

  useEffect(() => {
    void load(path);
  }, [load, path]);

  useEffect(() => {
    if (source || !inventory.targets.length) return;
    const fullest = inventory.targets
      .flatMap((target) =>
        (target.scopes ?? []).map((scope) => ({ cli: target.cli, scope: scope.scope, count: scope.itemCount })),
      )
      .sort((a, b) => b.count - a.count)[0];
    if (fullest) setSource({ cli: fullest.cli, scope: fullest.scope });
  }, [inventory.targets, source]);

  useEffect(() => {
    if (!source) return;
    if (!targetsTouched.current) {
      setTargets(defaultTargets(inventory.targets, source));
      return;
    }
    setTargets((current) => current.filter((entry) => entry.cli !== source.cli));
  }, [inventory.targets, source]);

  const sourceInfo = inventory.targets.find((entry) => entry.cli === source?.cli);
  const sourceLabel = source
    ? `${sourceInfo?.label ?? source.cli} · ${scopeLabel(source.scope, t)}`
    : "";
  const targetLabel =
    targets.length === 1
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

  const visibleItems = useMemo(() => {
    if (!targets.length) return sourceItems;
    return sourceItems.filter((item) =>
      matchesGaps(itemStatusSummary(item, targets, inventory.targets, inventory.items), gapsOnly),
    );
  }, [gapsOnly, inventory.items, inventory.targets, sourceItems, targets]);

  const coverage = source
    ? coverageSummary(inventory.items, source, targets, inventory.targets, kinds)
    : null;

  const selectedItems = useMemo(
    () => sourceItems.filter((item) => selected.has(item.id)),
    [selected, sourceItems],
  );

  const toggleTarget = useCallback((target: CapabilityTargetRef) => {
    targetsTouched.current = true;
    setTargets((current) =>
      current.some((entry) => targetKey(entry) === targetKey(target))
        ? current.filter((entry) => targetKey(entry) !== targetKey(target))
        : [...current, target],
    );
  }, []);

  const changeSource = useCallback((next: CapabilityTargetRef) => {
    setSource(next);
    setSelected(new Set());
  }, []);

  const showResults = useCallback(
    (outcome: CapabilityOpResult[], successKey: string) => {
      setResults(outcome);
      setStep(3);
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

  const goToCopy = useCallback(() => {
    const missing = sourceItems.filter(
      (item) => itemStatusSummary(item, targets, inventory.targets, inventory.items).missing > 0,
    );
    setSelected(new Set((missing.length ? missing : sourceItems).map((item) => item.id)));
    setGapsOnly(Boolean(missing.length));
    setStep(2);
  }, [inventory.items, inventory.targets, sourceItems, targets]);

  const steps = [
    t("agentCapabilities.hub.stepSource"),
    t("agentCapabilities.hub.stepTargets"),
    t("agentCapabilities.hub.stepCopy"),
    t("agentCapabilities.hub.stepDone"),
  ];

  if (loading && !inventory.targets.length) {
    return <CapabilityLoading label={t("agentCapabilities.hub.loading")} />;
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
        <div className="w-full min-w-0 px-[clamp(1rem,2.5vw,2rem)] pb-10 pt-6 max-sm:px-3 space-y-5">
        {error ? <CapabilityError message={error} /> : null}
        {inventory.warnings.map((warning) => (
          <CapabilityError key={warning} message={warning} />
        ))}

        <CapabilityGuideSteps
          steps={steps}
          current={step}
          onChange={(index) => {
            if (index < 3) setResults([]);
            setStep(index);
          }}
        />

        {step === 0 ? (
          <section className="flex min-w-0 flex-col gap-4">
            <h2 className="text-[1.2rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--ag-text)] text-pretty">{t("agentCapabilities.hub.stepSourceTitle")}</h2>
            <p className="max-w-[42rem] text-[13px] leading-5 text-[var(--ag-text-2)] text-pretty">{t("agentCapabilities.hub.stepSourceHint")}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16.5rem),1fr))] gap-3">
              {inventory.targets.map((target) => {
                const counts = kindCountsForCli(inventory.items, target.cli);
                const total = CAPABILITY_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
                const active = source?.cli === target.cli;
                return (
                  <CapabilityGuideChoice
                    key={target.cli}
                    selected={active}
                    onSelect={() =>
                      changeSource({
                        cli: target.cli,
                        scope: source?.cli === target.cli ? source.scope : preferredWritableScope(target),
                      })
                    }
                    mark={
                      <span className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] grid size-9 place-items-center rounded-[10px]">
                        <CapabilityCliMark cli={target.cli} logoClassName="size-4" />
                      </span>
                    }
                    title={target.label}
                    description={
                      target.installed
                        ? t("agentCapabilities.hub.itemsInSource", { count: total })
                        : t("agentCapabilities.hub.notInstalled")
                    }
                    badge={active ? t("agentCapabilities.hub.sourceBadge") : undefined}
                  />
                );
              })}
            </div>
            {source && sourceInfo ? (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-medium tracking-[0.02em] text-[var(--ag-text-3)]">{t("agentCapabilities.hub.scopeHint")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {CAPABILITY_SCOPES.map((scope) => {
                    const info = scopeInfo(sourceInfo, scope);
                    return (
                      <button
                        key={scope}
                        type="button"
                        aria-pressed={source.scope === scope}
                        onClick={() => changeSource({ cli: source.cli, scope })}
                        className={cn(
                          "inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface)] px-2.5 text-[11px] font-medium text-[var(--ag-text-2)] outline-none transition-[background-color,border-color,color,transform] duration-200 hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring h-7 gap-1.5 px-2.5 text-[11px] font-medium",
                          source.scope === scope && "bg-[var(--ag-solid)] text-[var(--ag-solid-fg)]",
                        )}
                      >
                        {scopeLabel(scope, t)}
                        <span className="tabular-nums">{info?.itemCount ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span />
              <Button type="button" disabled={!source} onClick={() => setStep(1)}>
                {t("tour.next")}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="flex min-w-0 flex-col gap-4">
            <h2 className="text-[1.2rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--ag-text)] text-pretty">{t("agentCapabilities.hub.stepTargetTitle")}</h2>
            <p className="max-w-[42rem] text-[13px] leading-5 text-[var(--ag-text-2)] text-pretty">
              {t("agentCapabilities.hub.stepTargetHint", { source: sourceLabel })}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16.5rem),1fr))] gap-3">
              {inventory.targets
                .filter((target) => target.cli !== source?.cli)
                .map((target) => {
                  const destination =
                    targets.find((entry) => entry.cli === target.cli) ?? {
                      cli: target.cli,
                      scope:
                        source && targetWritable(inventory.targets, { cli: target.cli, scope: source.scope })
                          ? source.scope
                          : preferredWritableScope(target),
                    };
                  const picked = targets.some((entry) => entry.cli === target.cli);
                  const gap =
                    source && picked
                      ? gapsToward(inventory.items, source, destination, inventory.targets, kinds)
                      : source
                        ? gapsToward(
                            inventory.items,
                            source,
                            { cli: target.cli, scope: preferredWritableScope(target) },
                            inventory.targets,
                            kinds,
                          )
                        : null;
                      const counts = kindCountsForCli(inventory.items, target.cli);
                      const total = CAPABILITY_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
                      const writable = targetWritable(inventory.targets, destination);
                      return (
                        <div key={target.cli} className="space-y-2">
                          <CapabilityGuideChoice
                            selected={picked}
                            disabled={!writable}
                            onSelect={() => toggleTarget(destination)}
                            mark={
                              <span className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] grid size-9 place-items-center rounded-[10px]">
                                <CapabilityCliMark cli={target.cli} logoClassName="size-4" />
                              </span>
                            }
                            title={target.label}
                            description={
                              gap?.missing.length
                                ? t("agentCapabilities.hub.gapsToward", { count: gap.missing.length })
                                : t("agentCapabilities.hub.itemsInSource", { count: total })
                            }
                        badge={picked ? t("agentCapabilities.hub.to") : undefined}
                      />
                      {picked ? (
                        <div className="flex flex-wrap gap-1.5 pl-1">
                          {CAPABILITY_SCOPES.map((scope) => {
                            const reference: CapabilityTargetRef = { cli: target.cli, scope };
                            if (!targetWritable(inventory.targets, reference)) return null;
                            const info = scopeInfo(target, scope);
                            const active = destination.scope === scope;
                            return (
                              <button
                                key={scope}
                                type="button"
                                aria-pressed={active}
                                onClick={() => {
                                  targetsTouched.current = true;
                                  setTargets((current) => [
                                    ...current.filter((entry) => entry.cli !== target.cli),
                                    reference,
                                  ]);
                                }}
                                className={cn(
                                  "inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface)] px-2.5 text-[11px] font-medium text-[var(--ag-text-2)] outline-none transition-[background-color,border-color,color,transform] duration-200 hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring h-6 gap-1 px-2 text-[10px] font-medium",
                                  active && "bg-[var(--ag-solid)] text-[var(--ag-solid-fg)]",
                                )}
                              >
                                {scopeLabel(scope, t)}
                                <span className="tabular-nums">{info?.itemCount ?? 0}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                <ArrowLeft className="size-3.5" />
                {t("tour.back")}
              </Button>
              <Button type="button" disabled={!targets.length} onClick={goToCopy}>
                {t("tour.next")}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="flex min-w-0 flex-col gap-4">
            <h2 className="text-[1.2rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--ag-text)] text-pretty">{t("agentCapabilities.hub.stepCopyTitle")}</h2>
            <p className="max-w-[42rem] text-[13px] leading-5 text-[var(--ag-text-2)] text-pretty">
              {coverage?.missing
                ? t("agentCapabilities.hub.stepCopyHint", {
                    missing: coverage.missing,
                    source: sourceLabel,
                    target: targetLabel,
                  })
                : t("agentCapabilities.hub.coverageClean")}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
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
                        current.includes(kind)
                          ? current.filter((entry) => entry !== kind)
                          : [...current, kind],
                      )
                    }
                    className={cn(
                      "inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface)] px-2.5 text-[11px] font-medium text-[var(--ag-text-2)] outline-none transition-[background-color,border-color,color,transform] duration-200 hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring h-7 gap-1.5 px-2 text-[10px] font-medium",
                      active && "bg-[var(--ag-selected)] text-[var(--ag-text)]",
                    )}
                  >
                    <Icon className="size-3" />
                    {t(`agentCapabilities.hub.kinds.${kind}`)}
                    {active ? <span className="text-[var(--ag-text-3)] tabular-nums">{count}</span> : null}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={gapsOnly}
                onClick={() => setGapsOnly((value) => !value)}
                className={cn(
                  "inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface)] px-2.5 text-[11px] font-medium text-[var(--ag-text-2)] outline-none transition-[background-color,border-color,color,transform] duration-200 hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring ml-auto h-7 px-2 text-[10px] font-medium",
                  gapsOnly && "bg-[var(--ag-selected)]",
                )}
              >
                {t("agentCapabilities.hub.views.gaps")}
              </button>
            </div>
            {visibleItems.length ? (
              <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-4">
                <ProgressiveCapabilityList
                  items={visibleItems}
                  getKey={(item) => item.id}
                  resetKey={`${source ? targetKey(source) : "none"}:${kinds.join(",")}:${gapsOnly}:${query}:${targets.map(targetKey).join(",")}`}
                  moreLabel={(count) => t("agentCapabilities.showMore", { count })}
                  renderItem={(item: CapabilityItem) => {
                    const Icon = KIND_ICONS[item.kind];
                    const checked = selected.has(item.id);
                    return (
                      <label
                        className={cn(
                          "rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)] transition-[transform,border-color,box-shadow] duration-200 hover:border-[var(--ag-line-strong)] flex cursor-pointer items-start gap-2.5 p-3 transition-colors",
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
                        <Icon className="text-[var(--ag-text-3)] mt-0.5 size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="truncate text-[12px] font-medium">{item.name}</span>
                          <span className="text-[var(--ag-text-2)] mt-0.5 line-clamp-2 block text-[10px] leading-4">
                            {item.description || t("agentCapabilities.hub.noDescription")}
                          </span>
                        </span>
                      </label>
                    );
                  }}
                />
              </div>
            ) : (
              <CapabilityEmpty
                title={
                  sourceItems.length
                    ? t("agentCapabilities.hub.filterEmptyTitle")
                    : t("agentCapabilities.hub.emptyTitle")
                }
                description={
                  sourceItems.length
                    ? t("agentCapabilities.hub.filterEmptyDescription")
                    : t("agentCapabilities.hub.emptyDescription")
                }
              />
            )}
            <details className="text-[12px] text-[var(--ag-text-2)] [&_summary]:cursor-pointer [&_summary]:font-medium">
              <summary>{t("agentCapabilities.hub.moreOptions")}</summary>
              <label className="mt-2 flex items-center gap-2 text-[12px]">
                <Switch checked={overwrite} onCheckedChange={setOverwrite} />
                {t("agentCapabilities.hub.overwrite")}
              </label>
              <p className="text-[var(--ag-text-3)] mt-1 text-[11px] leading-4">
                {overwrite
                  ? t("agentCapabilities.hub.overwriteOnHint")
                  : t("agentCapabilities.hub.overwriteOffHint")}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-8 text-destructive"
                disabled={busy || !selectedItems.length}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" />
                {t("agentCapabilities.hub.deleteFromSource", { source: sourceLabel })}
              </Button>
            </details>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="size-3.5" />
                {t("tour.back")}
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !targets.length}
                  onClick={() => void runPlan()}
                >
                  <Eye className="size-3.5" />
                  {t("agentCapabilities.hub.preview")}
                </Button>
                <Button
                  type="button"
                  disabled={busy || !selectedItems.length || !targets.length}
                  onClick={() => void runCopy()}
                >
                  <Copy className="size-3.5" />
                  {selectedItems.length
                    ? t("agentCapabilities.hub.copyAction", { count: selectedItems.length, target: targetLabel })
                    : t("agentCapabilities.hub.copy")}
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="flex min-w-0 flex-col gap-4">
            <h2 className="text-[1.2rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--ag-text)] text-pretty">{t("agentCapabilities.hub.stepDoneTitle")}</h2>
            <p className="max-w-[42rem] text-[13px] leading-5 text-[var(--ag-text-2)] text-pretty">{t("agentCapabilities.hub.stepDoneHint")}</p>
            {results.length ? (
              <ul className="space-y-1.5">
                {results.map((entry, index) => (
                  <li
                    key={`${entry.kind}:${entry.name}:${entry.target}:${index}`}
                    className="flex items-start gap-2 text-[12px]"
                  >
                    {entry.status === "error" ? (
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    ) : entry.status === "skipped" || entry.status === "unsupported" ? (
                      <FileWarning className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{entry.name}</span>
                      <span className="text-[var(--ag-text-3)]"> → {entry.target}</span>
                      <span className="text-[var(--ag-text-2)] block break-all text-[11px]">{entry.message}</span>
                      {entry.backup ? (
                        <span className="text-[var(--ag-text-3)] block break-all font-mono text-[10px]">
                          {t("agentCapabilities.hub.backup", { path: entry.backup })}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setResults([]);
                  setStep(0);
                }}
              >
                {t("agentCapabilities.hub.again")}
              </Button>
              <Button type="button" onClick={() => setStep(2)}>
                {t("tour.back")}
              </Button>
            </div>
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
                      <span className="text-[var(--ag-text-3)] block truncate text-[10px]">
                        {t(`agentCapabilities.hub.kinds.${entry.kind}`)} · {entry.targetCli} ·{" "}
                        {scopeLabel(entry.targetScope, t)} · {entry.detail}
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
            <AlertDialogTitle>{t("agentCapabilities.hub.deleteTitle", { count: selectedItems.length })}</AlertDialogTitle>
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
