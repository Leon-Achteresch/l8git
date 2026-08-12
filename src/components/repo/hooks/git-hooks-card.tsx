import { ListRow } from "@/components/ui/list-row";
import type { GitHookEntry } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { Webhook } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { GitHookStatusBadge } from "./git-hooks-status-badge";

export function GitHooksCard({
  entry,
  index,
  selected,
  isServer,
  onSelect,
}: {
  entry: GitHookEntry;
  index: number;
  selected: boolean;
  isServer?: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const desc = t(`hooks.kindDesc.${entry.name}`, { defaultValue: t("hooks.kindFallback") });

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.96, filter: "blur(4px)" }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 28,
        mass: 0.8,
        delay: index * 0.03,
        filter: { duration: 0.15 },
      }}
    >
      <ListRow
        variant="accent"
        active={selected}
        onClick={onSelect}
        className={cn(
          "group block cursor-pointer overflow-hidden rounded-xl border px-3 py-2.5",
          selected
            ? "border-primary/30 ring-1 ring-primary/20"
            : "border-border/60 bg-card shadow-xs hover:border-border hover:shadow-sm",
          isServer && "opacity-60",
        )}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              entry.is_enabled && !isServer
                ? "bg-git-added/12 text-git-added"
                : entry.exists && !isServer
                  ? "bg-git-modified/12 text-git-modified"
                  : "bg-muted/60 text-muted-foreground/50",
            )}
          >
            <Webhook className="h-3.5 w-3.5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[12px] font-semibold text-foreground/90">
                {entry.name}
              </span>
              <GitHookStatusBadge entry={entry} isServer={isServer} />
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">
              {desc}
            </p>
          </div>
        </div>
      </ListRow>
    </m.div>
  );
}
