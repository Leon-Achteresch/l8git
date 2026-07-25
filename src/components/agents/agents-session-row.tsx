import { SquareTerminal, X } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { SPRING_LAYOUT } from "@/@lib/ease";
import { integrationOf } from "@/lib/agent-integrations";
import { useTerminalActivity } from "@/lib/terminal/activity";
import { terminalLeafId } from "@/lib/terminal/leaf-id";
import type { TerminalTab } from "@/lib/terminal-store";
import { cn } from "@/lib/utils";

export function AgentsSessionRow({
  path,
  tab,
  active,
  layoutGroup,
  onSelect,
  onClose,
}: {
  path: string;
  tab: TerminalTab;
  active: boolean;
  layoutGroup: string;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const integration = integrationOf(tab);
  const Icon = integration?.icon ?? SquareTerminal;
  const working = useTerminalActivity(
    (s) => !!s.busy[terminalLeafId(path, tab.id)],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={cn(
        "group relative flex h-9 cursor-pointer items-center gap-2.5 rounded-xl px-2 text-xs transition-colors duration-200",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {active && (
        <m.span
          layoutId={`${layoutGroup}-session`}
          className="absolute inset-0 -z-10 rounded-xl bg-background shadow-sm ring-1 ring-border/60"
          transition={SPRING_LAYOUT}
          aria-hidden
        />
      )}
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-border/25 transition-colors duration-200",
          active ? "bg-foreground/[0.08]" : "bg-foreground/[0.04]",
        )}
      >
        <Icon className="size-3" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium tracking-tight">
        {tab.title}
      </span>
      {working && (
        <span className="relative flex size-1.5 shrink-0 group-hover:hidden">
          <m.span
            className="absolute inset-0 rounded-full bg-git-branch/60"
            animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeOut" }}
            aria-hidden
          />
          <span className="relative size-1.5 rounded-full bg-git-branch" />
        </span>
      )}
      <button
        type="button"
        aria-label={t("agents.close")}
        title={t("agents.close")}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full opacity-0 transition-[opacity,background-color,transform] duration-200 hover:bg-foreground/10 active:scale-90 group-hover:opacity-100 focus-visible:opacity-100",
          active && !working && "opacity-40",
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
