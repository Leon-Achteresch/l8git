import { SPRING_LAYOUT } from "@/@lib/ease";
import { integrationOf } from "@/lib/agent-integrations";
import { useTerminalActivity } from "@/lib/terminal/activity";
import { terminalLeafId } from "@/lib/terminal/leaf-id";
import type { TerminalTab } from "@/lib/terminal-store";
import { cn } from "@/lib/utils";
import { SquareTerminal, X } from "lucide-react";
import { m } from "motion/react";

interface Props {
  path: string;
  tab: TerminalTab;
  active: boolean;
  layoutGroup: string;
  onSelect: () => void;
  onClose: () => void;
  closeLabel: string;
}

export function TerminalTabChip({
  path,
  tab,
  active,
  layoutGroup,
  onSelect,
  onClose,
  closeLabel,
}: Props) {
  const TabIcon = integrationOf(tab)?.icon ?? SquareTerminal;
  const busy = useTerminalActivity(
    (s) => !!s.busy[terminalLeafId(path, tab.id)],
  );

  return (
    <div
      role="tab"
      aria-selected={active}
      className={cn(
        "group relative flex h-7 max-w-[168px] min-w-0 shrink-0 items-center gap-1 rounded-full pr-1 pl-2 text-[11px] transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && (
        <m.span
          layoutId={`${layoutGroup}-pill`}
          className="absolute inset-0 -z-10 rounded-full bg-background shadow-sm ring-1 ring-border/70"
          transition={SPRING_LAYOUT}
          aria-hidden
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
        title={tab.title}
      >
        <span className="relative flex size-3.5 shrink-0 items-center justify-center">
          <TabIcon
            className={cn(
              "size-3.5",
              active ? "text-foreground" : "text-muted-foreground/80",
            )}
          />
          {busy && (
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
        <span className="truncate font-medium tracking-tight">{tab.title}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={closeLabel}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full opacity-0 transition-[opacity,background-color,transform] duration-150 hover:bg-foreground/10 active:scale-90 group-hover:opacity-100 focus-visible:opacity-100",
          active && "opacity-60",
        )}
      >
        <X className="size-2.5" />
      </button>
    </div>
  );
}
