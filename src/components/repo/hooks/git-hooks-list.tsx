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
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GitHooksCard } from "./git-hooks-card";

const HOOK_CATEGORY_DEFS: {
  labelKey:
    | "hooks.categoryCommit"
    | "hooks.categoryEmailPatches"
    | "hooks.categoryMergeRebase"
    | "hooks.categoryBranchCheckout"
    | "hooks.categoryPush"
    | "hooks.categoryOther"
    | "hooks.categoryServer";
  hooks: string[];
  isServer?: boolean;
}[] = [
  {
    labelKey: "hooks.categoryCommit",
    hooks: [
      "pre-commit",
      "prepare-commit-msg",
      "commit-msg",
      "post-commit",
      "pre-merge-commit",
    ],
  },
  {
    labelKey: "hooks.categoryEmailPatches",
    hooks: ["applypatch-msg", "pre-applypatch", "post-applypatch"],
  },
  {
    labelKey: "hooks.categoryMergeRebase",
    hooks: ["pre-rebase", "post-rewrite", "post-merge"],
  },
  {
    labelKey: "hooks.categoryBranchCheckout",
    hooks: ["post-checkout", "reference-transaction"],
  },
  { labelKey: "hooks.categoryPush", hooks: ["pre-push"] },
  {
    labelKey: "hooks.categoryOther",
    hooks: ["pre-auto-gc", "post-index-change", "fsmonitor-watchman"],
  },
  {
    labelKey: "hooks.categoryServer",
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
  const { t, i18n } = useTranslation();
  const hooks = useRepoStore((s) => s.gitHooks[path]) ?? [];
  const loading = useRepoStore((s) => !!s.gitHooksLoading[path]);
  const reloadGitHooks = useRepoStore((s) => s.reloadGitHooks);
  const activeCount = hooks.filter((h) => h.is_enabled).length;

  const hookCategories = useMemo(
    () =>
      HOOK_CATEGORY_DEFS.map((c) => ({
        key: c.hooks[0] ?? c.labelKey,
        label: t(c.labelKey),
        hooks: c.hooks,
        isServer: c.isServer,
      })),
    [t, i18n.language],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/60">
            <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">{t("hooks.listTitle")}</p>
            {activeCount > 0 && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("hooks.activeHooks", { count: activeCount })}
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
              aria-label={t("hooks.reloadTooltip")}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{t("hooks.reloadTooltip")}</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-2 pb-4">
          {hookCategories.map((category) => (
            <div key={category.key}>
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
