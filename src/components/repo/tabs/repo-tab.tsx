import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChartPie,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { RepoLanguageStats } from "./repo-language-stats";

type RepoTabProps = {
  path: string;
  label: string;
  active: boolean;
};

function repoInitialChar(name: string): string {
  const m = name.match(/[A-Za-z0-9]/);
  return (m?.[0] ?? "?").toUpperCase();
}

function repoAvatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h) % 360;
}

export const RepoTab = memo(function RepoTab({
  path,
  label,
  active,
}: RepoTabProps) {
  const { t } = useTranslation();
  const {
    loading,
    favicon,
    branch,
    ahead,
    behind,
    hasUpstream,
    mergeConflictCount,
    cherryConflictCount,
  } = useRepoStore(
    useShallow((s) => {
      const repo = s.repos[path];
      const sync = s.upstreamSync[path];
      const m = s.mergeState[path];
      const c = s.cherryPickState[path];
      const mc = m?.conflicted_paths?.length ?? 0;
      const cc = c?.conflicted_paths?.length ?? 0;
      return {
        loading: !!s.loading[path],
        favicon: s.favicons[path] ?? null,
        branch: repo?.branch ?? "…",
        ahead: sync?.ahead ?? 0,
        behind: sync?.behind ?? 0,
        hasUpstream: !!s.hasUpstream[path],
        mergeConflictCount: mc,
        cherryConflictCount: cc,
      };
    }),
  );
  const [iconBroken, setIconBroken] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => {
    setIconBroken(false);
  }, [favicon]);
  const showFavicon = !!favicon && !iconBroken;
  const hue = repoAvatarHue(label);
  const avatarBg = `hsl(${hue} 42% 36%)`;

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({
      id: path,
      animateLayoutChanges: () => false,
    });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
  };

  const conflictCount = Math.max(mergeConflictCount, cherryConflictCount);
  const showConflictBadge = conflictCount > 0;
  const showAhead = hasUpstream && ahead > 0 && !showConflictBadge;
  const showBehind = hasUpstream && behind > 0 && !showConflictBadge;
  const showSyncMini = showConflictBadge || showAhead || showBehind;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            ref={setNodeRef}
            style={style}
            type="button"
            onClick={() => useRepoStore.getState().setActive(path)}
            onAuxClick={(e) => {
              if (e.button === 1) useRepoStore.getState().removeRepo(path);
            }}
            title={path}
            {...attributes}
            {...listeners}
            className={cn(
              "group relative inline-flex h-9 max-w-[200px] min-w-0 shrink-0 touch-none select-none items-center gap-1.5 rounded-[9px] border border-transparent py-0 pl-1.5 pr-2 text-left text-[12.5px] font-medium transition-colors duration-150",
              active
                ? "border-border bg-card text-foreground shadow-[0_1px_0_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.35)]"
                : "text-muted-foreground hover:bg-muted/50",
              isDragging && "z-10 scale-95 cursor-grabbing opacity-40",
            )}
          >
            <span
              className="flex size-[22px] shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]"
              style={
                showFavicon
                  ? undefined
                  : { backgroundColor: avatarBg }
              }
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin text-white/90" />
              ) : showFavicon ? (
                <img
                  src={favicon ?? undefined}
                  alt=""
                  onError={() => setIconBroken(true)}
                  className="size-[22px] rounded-md object-contain"
                />
              ) : (
                repoInitialChar(label)
              )}
            </span>

            <span className="flex min-w-0 flex-col items-start leading-[1.15]">
              <span
                className={cn(
                  "max-w-[100px] truncate text-xs font-semibold",
                  active ? "text-foreground" : "text-foreground/90",
                )}
              >
                {label}
              </span>
              <span className="max-w-[110px] truncate font-mono text-[10px] text-muted-foreground">
                {branch}
              </span>
            </span>

            {showSyncMini && (
              <span className="ml-0.5 inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
                {showConflictBadge ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700 dark:text-amber-500">
                    <AlertTriangle className="size-3" aria-hidden />
                    {conflictCount}
                  </span>
                ) : (
                  <>
                    {showAhead && (
                      <span className="inline-flex items-center gap-px font-semibold text-blue-600 dark:text-blue-400">
                        <ArrowUp className="size-3" aria-hidden />
                        {ahead}
                      </span>
                    )}
                    {showBehind && (
                      <span className="inline-flex items-center gap-px font-semibold text-red-700 dark:text-red-400">
                        <ArrowDown className="size-3" aria-hidden />
                        {behind}
                      </span>
                    )}
                  </>
                )}
              </span>
            )}

            <span
              role="button"
              tabIndex={-1}
              aria-label={t("repoTab.closeTabAria")}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useRepoStore.getState().removeRepo(path);
              }}
              className={cn(
                "ml-auto flex size-4 shrink-0 items-center justify-center rounded transition-all duration-100",
                "opacity-0 group-hover:opacity-60 hover:!opacity-100",
                "hover:bg-foreground/12",
                active && "group-hover:opacity-50",
              )}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onSelect={() => void useRepoStore.getState().reload(path)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("repoTab.reload")}
            <ContextMenuShortcut>
              {formatForDisplay("F5")} · {formatForDisplay("Mod+R")}
            </ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setLangOpen(true)}>
            <ChartPie className="h-3.5 w-3.5" />
            {t("repoTab.showLanguages")}
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => useRepoStore.getState().removeRepo(path)}
          >
            <X className="h-3.5 w-3.5" />
            {t("repoTab.close")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <RepoLanguageStats
        open={langOpen}
        path={path}
        onClose={() => setLangOpen(false)}
      />
    </>
  );
});
