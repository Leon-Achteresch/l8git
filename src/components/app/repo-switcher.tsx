import { ChevronsUpDown, Check, GitFork, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRepoStore, repoLabel } from "@/lib/repo-store";
import { cn } from "@/lib/utils";

export function RepoSwitcher() {
  const { paths, activePath, setActive, removeRepo } = useRepoStore(
    useShallow((s) => ({
      paths: s.paths,
      activePath: s.activePath,
      setActive: s.setActive,
      removeRepo: s.removeRepo,
    })),
  );

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActiveRoute = pathname === "/";

  const activeLabel = activePath ? repoLabel(activePath) : "Repository auswählen";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Link
          to="/"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/70",
            isActiveRoute ? "bg-muted text-foreground" : "text-muted-foreground",
            !activePath && "text-muted-foreground",
          )}
        >
          <GitFork className="size-4 shrink-0" />
          <span className="truncate max-w-[200px]">{activeLabel}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Link>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        {paths.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground text-center">
            Keine Repositories
          </div>
        ) : (
          paths.map((path) => (
            <DropdownMenuItem
              key={path}
              onSelect={() => setActive(path)}
              className="group flex items-center justify-between pr-1"
            >
              <span className="truncate">{repoLabel(path)}</span>
              <div className="flex items-center gap-1">
                {path === activePath && <Check className="size-4 shrink-0" />}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRepo(path);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100"
                  title="Repository schließen"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
