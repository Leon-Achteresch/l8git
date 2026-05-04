import { useCallback, useMemo, type CSSProperties } from "react";
import { Check, ChevronDown, GitBranch } from "lucide-react";
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
            const local =
              branchDisplayName(b).trim() || "branch";
            await checkoutBranch(activePath, local, { fromRemote: b.name });
          } else {
            await checkoutBranch(activePath, b.name);
          }
        } catch (e) {
          toastError(String(e));
        }
      })();
    },
    [activePath, checkoutBranch],
  );

  if (!activePath || !repo) return null;

  const disabled = repoLoading || repo.branches.length === 0;
  const shown = repo.branch || "…";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title="Branch wechseln"
          aria-label="Branch auswählen"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          className={cn(
            "mr-1 inline-flex max-w-[min(13rem,calc(100vw-360px))] shrink-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground shadow-none transition-colors",
            disabled
              ? "cursor-default opacity-50"
              : "cursor-pointer hover:bg-muted/60",
          )}
        >
          <GitBranch className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left">
            {shown}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 min-w-52">
        {locals.length > 0 ? (
          <>
            <DropdownMenuLabel>Lokal</DropdownMenuLabel>
            {locals.map((b) => {
              const label = branchDisplayName(b);
              return (
                <DropdownMenuItem
                  key={`l:${b.name}`}
                  disabled={b.is_current}
                  onSelect={() => onPick(b)}
                  className="min-w-0"
                >
                  {b.is_current ? (
                    <Check className="size-4 text-muted-foreground" />
                  ) : (
                    <span className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
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
            <DropdownMenuLabel>Remote</DropdownMenuLabel>
            {remotes.map((b) => {
              const label = branchDisplayName(b);
              return (
                <DropdownMenuItem
                  key={`r:${b.name}`}
                  disabled={b.is_current}
                  onSelect={() => onPick(b)}
                  className="min-w-0"
                >
                  {b.is_current ? (
                    <Check className="size-4 text-muted-foreground" />
                  ) : (
                    <span className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
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
