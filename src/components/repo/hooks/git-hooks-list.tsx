import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRepoStore } from "@/lib/repo-store";
import { RefreshCw, Webhook } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { GitHooksCard } from "./git-hooks-card";

const HOOK_CATEGORIES: {
  label: string;
  hooks: string[];
  isServer?: boolean;
}[] = [
  {
    label: "Commit",
    hooks: [
      "pre-commit",
      "prepare-commit-msg",
      "commit-msg",
      "post-commit",
      "pre-merge-commit",
    ],
  },
  {
    label: "E-Mail-Patches",
    hooks: ["applypatch-msg", "pre-applypatch", "post-applypatch"],
  },
  {
    label: "Merge & Rebase",
    hooks: ["pre-rebase", "post-rewrite", "post-merge"],
  },
  {
    label: "Branch & Checkout",
    hooks: ["post-checkout", "reference-transaction"],
  },
  { label: "Push", hooks: ["pre-push"] },
  {
    label: "Sonstiges",
    hooks: ["pre-auto-gc", "post-index-change", "fsmonitor-watchman"],
  },
  {
    label: "Server-seitig",
    hooks: [
      "pre-receive",
      "update",
      "proc-receive",
      "post-receive",
      "post-update",
      "push-to-checkout",
    ],
    isServer: true,
  },
];

export function GitHooksList({
  path,
  selectedHookName,
  onSelectHook,
}: {
  path: string;
  selectedHookName: string | null;
  onSelectHook: (name: string | null) => void;
}) {
  const hooks = useRepoStore((s) => s.gitHooks[path]) ?? [];
  const loading = useRepoStore((s) => !!s.gitHooksLoading[path]);
  const reloadGitHooks = useRepoStore((s) => s.reloadGitHooks);
  const activeCount = hooks.filter((h) => h.is_enabled).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/60">
            <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Git Hooks</p>
            {activeCount > 0 && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {activeCount} aktiv
              </p>
            )}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={loading}
              onClick={() => void reloadGitHooks(path)}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Aktualisieren</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-2 pb-4">
          {HOOK_CATEGORIES.map((category) => (
            <div key={category.label}>
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {category.label}
              </p>
              <div className="space-y-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  {category.hooks.map((name, i) => {
                    const entry = hooks.find((h) => h.name === name);
                    if (!entry) return null;
                    return (
                      <GitHooksCard
                        key={name}
                        entry={entry}
                        index={i}
                        selected={selectedHookName === name}
                        isServer={category.isServer}
                        onSelect={() =>
                          onSelectHook(
                            selectedHookName === name ? null : name,
                          )
                        }
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
