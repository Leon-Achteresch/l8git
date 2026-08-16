import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import { laneColor } from "@/lib/graph";
import { useRepoStore } from "@/lib/repo-store";
import type { StackBranch } from "@/lib/stack";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Layers,
  MoreHorizontal,
  Plus,
  Unlink,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function StackBranchRow({
  path,
  branch,
  busy,
  onCreateOnTop,
  onDetach,
  onRestack,
}: {
  path: string;
  branch: StackBranch;
  busy: boolean;
  onCreateOnTop: (parent: string) => void;
  onDetach: (name: string) => void;
  onRestack: (name: string) => void;
}) {
  const { t } = useTranslation();
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);
  const [expanded, setExpanded] = useState(false);

  const hasCommits = branch.commits.length > 0;

  async function checkout() {
    if (branch.is_current || !branch.exists) return;
    try {
      await checkoutBranch(path, branch.name);
    } catch (e) {
      toastError(String(e));
    }
  }

  return (
    <li className="min-w-0">
      <div
        className={cn(
          "group/stackrow relative flex min-w-0 items-center gap-1 rounded-md py-1 pl-1 pr-0.5 text-[12px] transition-colors",
          branch.is_current
            ? "bg-sidebar-accent/70 text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground",
        )}
        onDoubleClick={() => void checkout()}
      >
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground disabled:opacity-30"
          disabled={!hasCommits}
          aria-expanded={expanded}
          aria-label={t("stack.toggleCommitsAria", { name: branch.name })}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>

        <span
          aria-hidden
          className="h-3 w-[2px] shrink-0 rounded-full"
          style={{ backgroundColor: laneColor(branch.name) }}
        />

        {branch.is_current ? (
          <Check
            className="h-3 w-3 shrink-0 text-primary"
            aria-label={t("stack.currentAria")}
          />
        ) : null}

        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-[12px]",
            branch.exists ? "text-foreground/90" : "text-muted-foreground/70 line-through",
          )}
          title={t("stack.rowTitle", {
            name: branch.name,
            parent: branch.parent,
            level: branch.level,
          })}
        >
          {branch.name}
        </span>

        {branch.needs_restack ? (
          <AlertTriangle
            className="h-3 w-3 shrink-0 text-git-modified"
            aria-label={t("stack.needsRestackAria")}
          />
        ) : null}

        {branch.ahead > 0 ? (
          <span className="flex shrink-0 items-center gap-px rounded bg-git-added/10 px-1 text-[10px] font-semibold tabular-nums text-git-added">
            <ArrowUp className="size-2.5" aria-hidden />
            {branch.ahead}
          </span>
        ) : null}

        {branch.behind > 0 ? (
          <span className="flex shrink-0 items-center gap-px rounded bg-git-removed/10 px-1 text-[10px] font-semibold tabular-nums text-git-removed">
            <ArrowDown className="size-2.5" aria-hidden />
            {branch.behind}
          </span>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 group-hover/stackrow:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={t("stack.rowMenuAria", { name: branch.name })}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={branch.is_current || !branch.exists || busy}
              onSelect={() => void checkout()}
            >
              <GitBranch className="h-3.5 w-3.5" />
              {t("stack.actionCheckout")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!branch.exists || busy}
              onSelect={() =>
                window.requestAnimationFrame(() => onCreateOnTop(branch.name))
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {t("stack.actionCreateOnTop")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!branch.exists || !branch.parent_exists || busy}
              onSelect={() => onRestack(branch.name)}
            >
              <Layers className="h-3.5 w-3.5" />
              {t("stack.actionRestackFrom")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={busy} onSelect={() => onDetach(branch.name)}>
              <Unlink className="h-3.5 w-3.5" />
              {t("stack.actionDetach")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded ? (
        <ul className="mb-1 ml-6 space-y-px border-l border-sidebar-border/70 pl-2">
          {branch.commits.map((c) => (
            <li
              key={c.hash}
              className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-muted-foreground"
              title={c.subject}
            >
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
                {c.short_hash}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.subject}</span>
            </li>
          ))}
          {branch.commit_count > branch.commits.length ? (
            <li className="text-[10px] text-muted-foreground/70">
              {t("stack.moreCommits", {
                count: branch.commit_count - branch.commits.length,
              })}
            </li>
          ) : null}
          {branch.last_commit_at ? (
            <li className="pt-0.5 text-[10px] text-muted-foreground/70">
              {formatRelative(branch.last_commit_at)}
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
