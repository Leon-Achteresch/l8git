import { Check, FileDiff, FilePlus2 } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import type { AgentReviewFile } from "@/lib/agents/agent-review";
import { SPRING_LAYOUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentReviewFileList({
  files,
  selected,
  accepted,
  onSelect,
}: {
  files: readonly AgentReviewFile[];
  selected: string | null;
  accepted: ReadonlySet<string>;
  onSelect: (path: string) => void;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  if (files.length === 0) {
    return (
      <AgentsEnter className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {t("agentReview.noChanges")}
      </AgentsEnter>
    );
  }

  return (
    <m.ul layoutRoot className="ag-scroll h-full min-h-0 overflow-y-auto py-1">
      {files.map((file) => {
        const isSelected = file.path === selected;
        const Icon = file.untracked ? FilePlus2 : FileDiff;
        return (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => onSelect(file.path)}
              data-active={isSelected}
              className="ag-row relative flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px]"
              title={file.path}
            >
              {isSelected ? (
                <m.span
                  layoutId="agent-review-file"
                  className="pointer-events-none absolute inset-0 rounded-[var(--ag-r-md)] bg-[var(--ag-selected)]"
                  transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                />
              ) : null}
              <Icon className="relative z-[1] size-3 shrink-0 text-muted-foreground" />
              <span className="relative z-[1] min-w-0 flex-1 truncate font-mono">{file.path}</span>
              {accepted.has(file.path) ? (
                <Check className="relative z-[1] size-3 shrink-0 text-git-added" />
              ) : null}
              <span className="relative z-[1] shrink-0 tabular-nums">
                {file.binary ? (
                  <span className="text-muted-foreground">{t("agentReview.binary")}</span>
                ) : (
                  <>
                    <span className="text-git-added">+{file.additions}</span>{" "}
                    <span className="text-git-removed">-{file.deletions}</span>
                  </>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </m.ul>
  );
}

export function AgentReviewStat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span className="ag-inset inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]">
      <span className="ag-faint">{label}</span>
      <span className={cn("font-medium tabular-nums", className)}>{value}</span>
    </span>
  );
}
