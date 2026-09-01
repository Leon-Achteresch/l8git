import { Check, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityCliMark } from "@/components/agents/capabilities/capability-cli-mark";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  CapabilityKind,
  CapabilityScope,
  CapabilityTargetInfo,
  CapabilityTargetRef,
} from "@/lib/agents/capability-hub";
import {
  CAPABILITY_SCOPES,
  scopeInfo,
  targetKey,
  targetSupports,
  targetWritable,
} from "@/lib/agents/capability-hub";
import { cn } from "@/lib/utils";

export function scopeLabel(scope: CapabilityScope, t: (key: string) => string): string {
  return t(`agentCapabilities.hub.scopes.${scope}`);
}

export function CapabilityTargetPicker({
  targets,
  selected,
  onToggle,
  mode = "multi",
  requiredKinds,
  disabled = false,
  emptyLabel,
}: {
  targets: CapabilityTargetInfo[];
  selected: CapabilityTargetRef[];
  onToggle: (target: CapabilityTargetRef) => void;
  mode?: "multi" | "single";
  requiredKinds?: CapabilityKind[] | null;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const isSelected = (target: CapabilityTargetRef) =>
    selected.some((entry) => targetKey(entry) === targetKey(target));

  if (!targets.length) {
    return <p className="ag-faint px-1 text-[11px]">{emptyLabel ?? t("agentCapabilities.hub.noTargets")}</p>;
  }

  return (
    <div className="space-y-1.5">
      {targets.map((target) => {
        const supports =
          !requiredKinds?.length ||
          requiredKinds.some((kind) => targetSupports(targets, target.cli, kind));
        return (
          <div key={target.cli} className="flex items-center gap-2">
            <div className="flex w-36 shrink-0 items-center gap-1.5">
              <CapabilityCliMark
                cli={target.cli}
                label={target.label}
                className={cn("min-w-0 text-[11px] font-medium", !supports && "text-muted-foreground line-through")}
              />
              {target.installed ? null : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="h-4 rounded px-1 text-[8px]">
                      {t("agentCapabilities.hub.notInstalled")}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{t("agentCapabilities.hub.notInstalledHint", { command: target.command })}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {CAPABILITY_SCOPES.map((scope) => {
                const info = scopeInfo(target, scope);
                const reference: CapabilityTargetRef = { cli: target.cli, scope };
                const writable = targetWritable(targets, reference);
                const blocked = disabled || !supports || !writable;
                const active = isSelected(reference);
                return (
                  <Tooltip key={scope}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        role={mode === "single" ? "radio" : "checkbox"}
                        aria-checked={active}
                        disabled={blocked}
                        onClick={() => onToggle(reference)}
                        className={cn(
                          "ag-pill h-7 gap-1 px-2 text-[10px] font-medium",
                          active && "bg-[var(--ag-selected)] text-[var(--ag-text)]",
                          blocked && "cursor-not-allowed opacity-40",
                        )}
                      >
                        {active ? <Check className="size-3" /> : null}
                        {!writable && supports ? <Lock className="size-3" /> : null}
                        {scopeLabel(scope, t)}
                        <span className="ag-faint tabular-nums">{info?.itemCount ?? 0}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm break-all">
                      {!supports
                        ? t("agentCapabilities.hub.kindUnsupported", { label: target.label })
                        : info?.root ?? t("agentCapabilities.hub.noPath")}
                      {supports && !writable ? ` · ${t("agentCapabilities.hub.readOnly")}` : ""}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
