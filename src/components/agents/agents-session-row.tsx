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
        "group relative flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && (
        <m.span
          layoutId={`${layoutGroup}-session`}
          className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm ring-1 ring-border/60"
          transition={SPRING_LAYOUT}
          aria-hidden
        />
      )}
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-3.5" />
        {working && (
          <m.span
            className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-git-branch"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [1, 0.85, 1], opacity: 1 }}
            transition={{
              scale: { repeat: Infinity, duration: 1.2, ease: "easeInOut" },
              opacity: { duration: 0.2 },
            }}
            aria-hidden
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium tracking-tight">
        {tab.title}
      </span>
      <button
        type="button"
        aria-label={t("agents.close")}
        title={t("agents.close")}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md opacity-0 transition-[opacity,background-color,transform] duration-150 hover:bg-foreground/10 active:scale-90 group-hover:opacity-100 focus-visible:opacity-100",
          active && "opacity-50",
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
