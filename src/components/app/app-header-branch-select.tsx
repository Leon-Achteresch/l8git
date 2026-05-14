import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronDown, GitBranch } from "lucide-react";
import { motion } from "motion/react";
import { useShallow } from "zustand/react/shallow";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastError } from "@/lib/error-toast";
import type { Branch } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

function branchDisplayName(b: Branch) {
  if (!b.is_remote) return b.name;
  const i = b.name.indexOf("/");
  return i >= 0 ? b.name.slice(i + 1) : b.name;
}

function cmpBranches(a: Branch, b: Branch) {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
  return branchDisplayName(a).localeCompare(branchDisplayName(b), undefined, {
    sensitivity: "base",
  });
}

export function AppHeaderBranchSelect() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { activePath, repo, repoLoading } = useRepoStore(
    useShallow((s) => {
      const p = s.activePath;
      return {
        activePath: p,
        repo: p ? s.repos[p] : null,
        repoLoading: p ? !!s.loading[p] : false,
      };
    }),
  );
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);

  const locals = useMemo(() => {
    if (!repo) return [];
    return repo.branches.filter((b) => !b.is_remote).slice().sort(cmpBranches);
  }, [repo]);

  const remotes = useMemo(() => {
    if (!repo) return [];
    return repo.branches.filter((b) => b.is_remote).slice().sort(cmpBranches);
  }, [repo]);

  const onPick = useCallback(
    (b: Branch) => {
      if (!activePath || b.is_current) return;
      void (async () => {
        try {
          if (b.is_remote) {
            const local = branchDisplayName(b).trim() || t("branchMenu.fallbackLocalName");
            await checkoutBranch(activePath, local, { fromRemote: b.name });
          } else {
            await checkoutBranch(activePath, b.name);
          }
        } catch (e) {
          toastError(String(e));
        }
      })();
    },
    [activePath, checkoutBranch, t],
  );

  if (!activePath || !repo) return null;

  const disabled = repoLoading || repo.branches.length === 0;
  const shown = repo.branch || "…";

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <motion.button
          type="button"
          disabled={disabled}
          title={t("branchMenu.switchTitle")}
          aria-label={t("branchMenu.pickAria")}
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          whileHover={disabled ? undefined : { scale: 1.02 }}
          whileTap={disabled ? undefined : { scale: 0.97 }}
          transition={{ type: "spring", stiffness: 520, damping: 32, mass: 0.35 }}
          className={cn(
            "mr-0.5 inline-flex h-7 max-w-[min(10rem,calc(100vw-300px))] shrink-0 items-center gap-1 rounded-md border border-border/80 bg-background/95 px-1.5 text-xs font-medium text-foreground shadow-none backdrop-blur-sm",
            disabled
              ? "cursor-default opacity-50"
              : "cursor-pointer hover:bg-muted/50",
          )}
        >
          <GitBranch
            className="size-3 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
          <motion.span layout className="min-w-0 flex-1 truncate text-left tabular-nums">
            {shown}
          </motion.span>
          <motion.span
            className="flex size-3 shrink-0 items-center justify-center text-muted-foreground"
            animate={{ rotate: menuOpen ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
          >
            <ChevronDown className="size-3" strokeWidth={2} />
          </motion.span>
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="max-h-64 min-w-[10.5rem] gap-0 p-0.5"
      >
        {locals.length > 0 ? (
          <>
            <DropdownMenuLabel className="px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground/90">
              {t("branchMenu.sectionLocal")}
            </DropdownMenuLabel>
            {locals.map((b) => {
              const label = branchDisplayName(b);
              return (
                <DropdownMenuItem
                  key={`l:${b.name}`}
                  disabled={b.is_current}
                  onSelect={() => onPick(b)}
                  className="min-w-0 gap-1 py-0.5 pr-1.5 pl-1 text-xs"
                >
                  {b.is_current ? (
                    <Check className="size-3 text-muted-foreground" strokeWidth={2} />
                  ) : (
                    <span className="size-3 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] leading-tight">
                    {label}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </>
        ) : null}
        {locals.length > 0 && remotes.length > 0 ? <DropdownMenuSeparator /> : null}
        {remotes.length > 0 ? (
          <>
            <DropdownMenuLabel className="px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground/90">
              {t("branchMenu.sectionRemote")}
            </DropdownMenuLabel>
            {remotes.map((b) => {
              const label = branchDisplayName(b);
              return (
                <DropdownMenuItem
                  key={`r:${b.name}`}
                  disabled={b.is_current}
                  onSelect={() => onPick(b)}
                  className="min-w-0 gap-1 py-0.5 pr-1.5 pl-1 text-xs"
                >
                  {b.is_current ? (
                    <Check className="size-3 text-muted-foreground" strokeWidth={2} />
                  ) : (
                    <span className="size-3 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] leading-tight">
                    {label}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
