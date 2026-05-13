import type { GitHookEntry } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { Webhook } from "lucide-react";
import { motion } from "motion/react";
import { GitHookStatusBadge } from "./git-hooks-status-badge";

export const HOOK_DESCRIPTIONS: Record<string, string> = {
  "pre-commit": "Läuft vor dem Commit — Abbruch möglich",
  "prepare-commit-msg": "Bearbeitet die Standard-Commit-Nachricht",
  "commit-msg": "Validiert die Commit-Nachricht — Abbruch möglich",
  "post-commit": "Benachrichtigung nach dem Commit",
  "pre-merge-commit": "Wie pre-commit, aber für Merges — Abbruch möglich",
  "applypatch-msg": "Wie commit-msg für git am — Abbruch möglich",
  "pre-applypatch": "Nach Patch, vor Commit — Abbruch möglich",
  "post-applypatch": "Nach git am",
  "pre-rebase": "Vor dem Rebase — Abbruch möglich",
  "post-rewrite": "Nach amend/rebase",
  "post-merge": "Nach dem Merge",
  "post-checkout": "Nach checkout/switch",
  "reference-transaction": "Bei Referenz-Updates",
  "pre-push": "Vor dem Push — Abbruch möglich",
  "pre-auto-gc": "Vor automatischer Garbage Collection",
  "post-index-change": "Nach Index-Schreibvorgang",
  "fsmonitor-watchman": "Für fsmonitor-Integration",
  "pre-receive": "Server: vor Empfang — Abbruch möglich",
  update: "Server: pro Branch — Abbruch möglich",
  "proc-receive": "Server: verarbeitet Push-Refs",
  "post-receive": "Server: nach Empfang",
  "post-update": "Server: nach Update",
  "push-to-checkout": "Server: Branch-Checkout nach Push",
};

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
  return (
    <motion.div
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
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group w-full cursor-pointer overflow-hidden rounded-xl border text-left transition-all duration-150",
          "px-3 py-2.5",
          selected
            ? "border-primary/30 bg-primary/8 shadow-sm ring-1 ring-primary/20"
            : "border-border/60 bg-card shadow-xs hover:border-border hover:shadow-sm",
          isServer && "opacity-60",
        )}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              entry.is_enabled && !isServer
                ? "bg-green-500/12 text-green-600 dark:text-green-400"
                : entry.exists && !isServer
                  ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
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
              {HOOK_DESCRIPTIONS[entry.name] ?? "Git-Hook"}
            </p>
          </div>
        </div>
      </button>
    </motion.div>
  );
}
