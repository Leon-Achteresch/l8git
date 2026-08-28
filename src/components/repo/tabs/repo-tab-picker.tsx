import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { repoAvatarHue, repoInitialChar } from "@/lib/repo-avatar";
import { repoLabel, useRepoStore } from "@/lib/repo-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import { cn } from "@/lib/utils";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronsUpDown, Layers, Search, X } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

export function RepoTabPicker({
  paths,
  activePath,
  overflowing,
}: {
  paths: string[];
  activePath: string | null;
  overflowing: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const onAgents = useRouterState({
    select: (s) => s.location.pathname.startsWith("/agents"),
  });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [moveFor, setMoveFor] = useState<string | null>(null);

  const { workspaces, activeWorkspaceId } = useWorkspaceStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      activeWorkspaceId: s.activeWorkspaceId,
    })),
  );
  const workspaceTargets = workspaces.filter((w) => w.id !== activeWorkspaceId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return paths;
    return paths.filter((p) => {
      const label = repoLabel(p).toLocaleLowerCase();
      return label.includes(needle) || p.toLocaleLowerCase().includes(needle);
    });
  }, [paths, query]);

  if (paths.length < 2) return null;

  const select = (path: string) => {
    if (onAgents) {
      useAgentRepoStore.getState().setPath(path);
    } else {
      useRepoStore.getState().setActive(path);
      void router.navigate({ to: "/" });
    }
    setOpen(false);
    setQuery("");
    setMoveFor(null);
  };

  const moveTo = (repoPath: string, workspaceId: string) => {
    useWorkspaceStore.getState().moveReposToWorkspace([repoPath], workspaceId);
    const { activePath: current, paths: openPaths } = useRepoStore.getState();
    if (current === repoPath) {
      const { workspaces: next, activeWorkspaceId: currentId } =
        useWorkspaceStore.getState();
      const remaining = next.find((w) => w.id === currentId)?.repoPaths ?? [];
      const fallback = remaining.find((p) => openPaths.includes(p));
      if (fallback) useRepoStore.getState().setActive(fallback);
    }
    setMoveFor(null);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setMoveFor(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("repoTabPicker.openAria")}
          aria-label={t("repoTabPicker.openAria")}
          className={cn(
            "relative flex h-7 shrink-0 items-center gap-1 rounded-lg px-1.5 text-muted-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground",
            open && "bg-foreground/10 text-foreground",
            overflowing && "text-foreground",
          )}
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <ChevronsUpDown className="size-3.5" />
          {(overflowing || paths.length > 6) && (
            <span className="font-mono text-[10px] font-semibold tabular-nums">
              {paths.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[280px] gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("repoTabPicker.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <ul className="max-h-[min(50vh,320px)] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("repoTabPicker.empty")}
            </li>
          ) : (
            filtered.map((path) => {
              const label = repoLabel(path);
              const hue = repoAvatarHue(label);
              const active = path === activePath;
              const moving = moveFor === path;
              return (
                <li key={path} className="flex flex-col">
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-md",
                      active && "bg-muted",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => select(path)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left hover:bg-foreground/[0.04]"
                    >
                      <span
                        className="flex size-[18px] shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold text-white"
                        style={{ backgroundColor: `hsl(${hue} 42% 36%)` }}
                        aria-hidden
                      >
                        {repoInitialChar(label)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {label}
                      </span>
                    </button>
                    {workspaceTargets.length > 0 && (
                      <button
                        type="button"
                        title={t("repoWorkspaceSwitch.moveToWorkspace")}
                        aria-label={t("repoWorkspaceSwitch.moveToWorkspace")}
                        onClick={() =>
                          setMoveFor((cur) => (cur === path ? null : path))
                        }
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
                          moving && "bg-foreground/10 text-foreground",
                        )}
                      >
                        <Layers className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      title={t("repoTab.close")}
                      aria-label={t("repoTab.closeTabAria")}
                      onClick={() => useRepoStore.getState().removeRepo(path)}
                      className="mr-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {moving && (
                    <div className="mb-1 ml-7 mr-1 flex flex-col gap-0.5 rounded-md border border-border/50 bg-muted/40 p-1">
                      {workspaceTargets.map((ws) => (
                        <button
                          key={ws.id}
                          type="button"
                          onClick={() => moveTo(path, ws.id)}
                          className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-foreground/10"
                        >
                          <span
                            className="flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold text-white"
                            style={{
                              backgroundColor: `hsl(${repoAvatarHue(ws.name)} 52% 40%)`,
                            }}
                            aria-hidden
                          >
                            {repoInitialChar(ws.name)}
                          </span>
                          <span className="truncate">{ws.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
