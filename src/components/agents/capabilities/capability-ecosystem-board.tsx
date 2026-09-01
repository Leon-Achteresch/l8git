import { ArrowRight, Lock } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { CapabilityCliMark } from "@/components/agents/capabilities/capability-cli-mark";
import { scopeLabel } from "@/components/agents/capabilities/capability-targets";
import { Button } from "@/components/ui/button";
import type {
  CapabilityItem,
  CapabilityKind,
  CapabilityTargetInfo,
  CapabilityTargetRef,
} from "@/lib/agents/capability-hub";
import {
  CAPABILITY_KINDS,
  CAPABILITY_SCOPES,
  gapsToward,
  kindCountsForCli,
  preferredWritableScope,
  scopeInfo,
  targetKey,
  targetSupports,
  targetWritable,
} from "@/lib/agents/capability-hub";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function CapabilityEcosystemBoard({
  targets,
  items,
  source,
  onSourceChange,
  selected,
  onToggleTarget,
  kinds = CAPABILITY_KINDS,
  requiredKinds,
  busy = false,
  onFillGaps,
}: {
  targets: CapabilityTargetInfo[];
  items: CapabilityItem[];
  source?: CapabilityTargetRef | null;
  onSourceChange?: (source: CapabilityTargetRef) => void;
  selected: CapabilityTargetRef[];
  onToggleTarget: (target: CapabilityTargetRef) => void;
  kinds?: readonly CapabilityKind[];
  requiredKinds?: CapabilityKind[] | null;
  busy?: boolean;
  onFillGaps?: (target: CapabilityTargetRef, missing: CapabilityItem[]) => void;
}) {
  const { t } = useTranslation();
  const isSelected = (target: CapabilityTargetRef) =>
    selected.some((entry) => targetKey(entry) === targetKey(target));

  if (!targets.length) {
    return <p className="ag-faint px-1 text-[11px]">{t("agentCapabilities.hub.noTargets")}</p>;
  }

  const ordered = source && onSourceChange
    ? [...targets].sort((a, b) => Number(b.cli === source.cli) - Number(a.cli === source.cli))
    : targets;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {ordered.map((target, index) => {
        const supports =
          !requiredKinds?.length ||
          requiredKinds.some((kind) => targetSupports(targets, target.cli, kind));
        const isSource = source?.cli === target.cli;
        const counts = kindCountsForCli(items, target.cli, kinds);
        const total = CAPABILITY_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
        const destination: CapabilityTargetRef = selected.find((entry) => entry.cli === target.cli)
          ?? { cli: target.cli, scope: source?.scope ?? preferredWritableScope(target) };
        const gap = source && !isSource
          ? gapsToward(items, source, destination, targets, kinds)
          : null;
        const showArrow = Boolean(onSourceChange) && index === 1;

        return (
          <div key={target.cli} className="flex min-w-0 items-stretch gap-2">
            {showArrow ? (
              <span className="hidden w-4 shrink-0 items-center justify-center self-center sm:flex" aria-hidden>
                <ArrowRight className="size-3.5 text-[var(--ag-text-3)]" />
              </span>
            ) : null}
            <m.article
              className={cn(
                "ag-card relative flex w-[11.5rem] shrink-0 flex-col gap-2.5 p-3",
                isSource && "border-[var(--ag-text)]/25 bg-[var(--ag-selected)]",
                !supports && "opacity-50",
                !target.installed && "border-dashed",
              )}
              whileHover={{ y: -1 }}
              transition={SPRING_PANEL}
            >
              <button
                type="button"
                disabled={!onSourceChange}
                onClick={() => {
                  if (!onSourceChange || source?.cli === target.cli) return;
                  onSourceChange({ cli: target.cli, scope: preferredWritableScope(target) });
                }}
                className={cn(
                  "flex w-full items-start gap-2 text-left",
                  onSourceChange && "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !onSourceChange && "cursor-default",
                )}
              >
                <span className="ag-inset grid size-8 shrink-0 place-items-center rounded-[9px]">
                  <CapabilityCliMark cli={target.cli} logoClassName="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium">{target.label}</span>
                  </span>
                  <span className="ag-faint mt-0.5 block text-[10px] tabular-nums">
                    {target.installed
                      ? t("agentCapabilities.hub.itemsInSource", { count: total })
                      : t("agentCapabilities.hub.notInstalled")}
                  </span>
                </span>
              </button>

              {isSource ? (
                <p className="ag-label">{t("agentCapabilities.hub.sourceBadge")}</p>
              ) : null}

              <div className="flex flex-wrap gap-1">
                {CAPABILITY_SCOPES.map((scope) => {
                  const info = scopeInfo(target, scope);
                  const reference: CapabilityTargetRef = { cli: target.cli, scope };
                  const writable = targetWritable(targets, reference);
                  const blocked = !supports || !writable;
                  const active = isSource ? source?.scope === scope : isSelected(reference);
                  return (
                    <button
                      key={scope}
                      type="button"
                      disabled={isSource ? !onSourceChange : blocked}
                      aria-pressed={active}
                      title={
                        !supports
                          ? t("agentCapabilities.hub.kindUnsupported", { label: target.label })
                          : `${info?.root ?? t("agentCapabilities.hub.noPath")}${supports && !writable ? ` · ${t("agentCapabilities.hub.readOnly")}` : ""}`
                      }
                      onClick={() => {
                        if (isSource) {
                          onSourceChange?.({ cli: target.cli, scope });
                          return;
                        }
                        if (blocked) return;
                        onToggleTarget(reference);
                      }}
                      className={cn(
                        "ag-pill h-6 gap-1 px-1.5 text-[9px] font-medium",
                        active && "bg-[var(--ag-solid)] text-[var(--ag-solid-fg)]",
                        blocked && !isSource && "cursor-not-allowed opacity-40",
                      )}
                    >
                      {!writable && supports ? <Lock className="size-2.5" /> : null}
                      {scopeLabel(scope, t)}
                      <span className={cn("tabular-nums", active ? "opacity-80" : "ag-faint")}>
                        {info?.itemCount ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              <ul className="mt-auto space-y-0.5">
                {CAPABILITY_KINDS.filter((kind) => counts[kind] > 0).map((kind) => (
                  <li key={kind} className="flex items-center justify-between text-[10px] text-[var(--ag-text-2)]">
                    <span className="truncate">{t(`agentCapabilities.hub.kinds.${kind}`)}</span>
                    <span className="tabular-nums">{counts[kind]}</span>
                  </li>
                ))}
                {total === 0 ? (
                  <li className="ag-faint text-[10px]">{t("agentCapabilities.hub.emptyCli")}</li>
                ) : null}
              </ul>

              {gap && (gap.missing.length || gap.different.length) ? (
                <div className="space-y-1.5 border-t border-[var(--ag-line)] pt-2">
                  {gap.missing.length ? (
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                      {t("agentCapabilities.hub.gapsToward", { count: gap.missing.length })}
                    </p>
                  ) : null}
                  {gap.different.length ? (
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">
                      {t("agentCapabilities.hub.differsToward", { count: gap.different.length })}
                    </p>
                  ) : null}
                  {onFillGaps && gap.missing.length && targetWritable(targets, destination) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-full px-2 text-[10px]"
                      disabled={busy}
                      onClick={() => onFillGaps(destination, gap.missing)}
                    >
                      {t("agentCapabilities.hub.fillGaps")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </m.article>
          </div>
        );
      })}
    </div>
  );
}
