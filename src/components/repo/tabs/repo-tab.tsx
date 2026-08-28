import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import { repoAvatarHue, repoInitialChar } from "@/lib/repo-avatar";
import { useRepoGroupsStore } from "@/lib/repo-groups-store";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChartPie,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { m } from "motion/react";
import { memo, useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { RepoGroupDialog } from "./repo-group-dialog";
import { RepoLanguageStats } from "./repo-language-stats";
import { RepoTabGroupActions } from "./repo-tab-group-actions";
import { RepoWorkspaceMoveActions } from "./repo-workspace-move-actions";
import { SpinIcon } from "@/components/motion/kit";

type RepoTabProps = {
  path: string;
  label: string;
  active: boolean;
  variant?: "bar" | "group";
};

const INDICATOR_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 38,
  mass: 0.55,
} as const;

function TabCornerLeft() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute -left-[15px] bottom-0 [filter:drop-shadow(-1.2px_-0.5px_1px_rgba(0,0,0,0.10))]"
    >
      <path
        d="M15 15H0C8.28427 15 15 8.28427 15 0V15Z"
        fill="var(--background)"
      />
    </svg>
  );
}

function TabCornerRight() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute -right-[15px] bottom-0 [filter:drop-shadow(1.2px_-0.5px_1px_rgba(0,0,0,0.10))]"
    >
      <path
        d="M0 15L6.5568e-07 0C2.93563e-07 8.28427 6.71573 15 15 15L0 15Z"
        fill="var(--background)"
      />
    </svg>
  );
}

export const RepoTab = memo(function RepoTab({
  path,
  label,
  active,
  variant = "bar",
}: RepoTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    loading,
    favicon,
    ahead,
    behind,
    hasUpstream,
    mergeConflictCount,
    cherryConflictCount,
  } = useRepoStore(
    useShallow((s) => {
      const sync = s.upstreamSync[path];
      const m = s.mergeState[path];
      const c = s.cherryPickState[path];
      const mc = m?.conflicted_paths?.length ?? 0;
      const cc = c?.conflicted_paths?.length ?? 0;
      return {
        loading: !!s.loading[path],
        favicon: s.favicons[path] ?? null,
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
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  useEffect(() => {
    setIconBroken(false);
  }, [favicon]);
  const showFavicon = !!favicon && !iconBroken;
  const hue = repoAvatarHue(label);
  const avatarBg = `hsl(${hue} 42% 36%)`;
  const isBar = variant === "bar";

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({
      id: path,
      animateLayoutChanges: () => false,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    WebkitAppRegion: "no-drag",
  } as CSSProperties;

  const conflictCount = Math.max(mergeConflictCount, cherryConflictCount);
  const showConflictBadge = conflictCount > 0;
  const showAhead = hasUpstream && ahead > 0 && !showConflictBadge;
  const showBehind = hasUpstream && behind > 0 && !showConflictBadge;
  const showSyncMini = showConflictBadge || showAhead || showBehind;

  const compact = isBar && !active;

  const content = (
    <>
      <span
        className="relative flex size-[18px] shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]"
        style={showFavicon ? undefined : { backgroundColor: avatarBg }}
      >
        {loading ? (
          <SpinIcon icon={Loader2} className="size-3 text-white/90" />
        ) : showFavicon ? (
          <img
            src={favicon ?? undefined}
            alt=""
            onError={() => setIconBroken(true)}
            className="size-[18px] rounded object-contain"
          />
        ) : (
          repoInitialChar(label)
        )}
        {compact && showConflictBadge && (
          <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-git-modified" />
        )}
      </span>

      {!compact && (
        <span
          className={cn(
            "min-w-[3ch] max-w-[160px] shrink truncate text-xs font-semibold",
            active ? "text-foreground" : "text-foreground/85",
          )}
        >
          {label}
        </span>
      )}

      {!compact && showSyncMini && (
        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
          {showConflictBadge ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-git-modified">
              <AlertTriangle className="size-3" aria-hidden />
              {conflictCount}
            </span>
          ) : (
            <>
              {showAhead && (
                <span className="inline-flex items-center gap-px font-semibold text-git-branch">
                  <ArrowUp className="size-3" aria-hidden />
                  {ahead}
                </span>
              )}
              {showBehind && (
                <span className="inline-flex items-center gap-px font-semibold text-git-removed">
                  <ArrowDown className="size-3" aria-hidden />
                  {behind}
                </span>
              )}
            </>
          )}
        </span>
      )}

      {!compact && (
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
            "ms-auto flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-100",
            active
              ? "text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              : "text-muted-foreground/70 opacity-0 group-hover:opacity-100 hover:bg-foreground/10 hover:text-foreground",
          )}
        >
          <X className="size-3" />
        </span>
      )}
    </>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            ref={setNodeRef}
            style={style}
            type="button"
            onClick={() => {
              if (router.state.location.pathname.startsWith("/agents")) {
                useAgentRepoStore.getState().setPath(path);
                return;
              }
              useRepoStore.getState().setActive(path);
              void router.navigate({ to: "/" });
            }}
            onAuxClick={(e) => {
              if (e.button === 1) useRepoStore.getState().removeRepo(path);
            }}
            title={`${label}\n${path}`}
            data-repo-path={path}
            data-active={active || undefined}
            {...attributes}
            {...listeners}
            className={cn(
              "group relative isolate flex min-w-0 touch-none select-none items-center text-left text-xs font-medium transition-colors duration-150",
              isBar
                ? cn(
                    "h-full shrink-0 self-stretch rounded-t-2xl",
                    active ? "max-w-[260px]" : "w-8",
                  )
                : "h-7 max-w-[240px] shrink-0 gap-1.5 rounded-lg pl-1.5 pr-1.5",
              active ? "text-foreground" : "text-muted-foreground",
              isDragging && "z-10 cursor-grabbing opacity-40",
            )}
          >
            {active &&
              (isBar ? (
                <m.span
                  layoutId="repo-tab-bar-indicator"
                  className="absolute inset-0 -z-10"
                  transition={INDICATOR_SPRING}
                  aria-hidden
                >
                  <span className="absolute inset-0 rounded-t-2xl bg-background [box-shadow:-1px_-1px_1px_0.1px_rgba(0,0,0,0.08),1px_-1px_1px_0.1px_rgba(0,0,0,0.08)]" />
                  <TabCornerLeft />
                  <TabCornerRight />
                </m.span>
              ) : (
                <m.span
                  layoutId="repo-tab-group-indicator"
                  className="absolute inset-0 -z-10 rounded-lg border border-border bg-card shadow-[0_1px_0_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.35)]"
                  transition={INDICATOR_SPRING}
                  aria-hidden
                />
              ))}
            {isBar ? (
              <span
                className={cn(
                  "flex h-full w-full min-w-0 items-center rounded-[12px]",
                  compact ? "justify-center px-1" : "gap-1.5 px-2",
                  !active && "group-hover:bg-foreground/10",
                )}
              >
                {content}
              </span>
            ) : (
              content
            )}
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
          <RepoTabGroupActions
            path={path}
            onCreateGroup={() => setCreateGroupOpen(true)}
          />
          <RepoWorkspaceMoveActions paths={[path]} />
          <ContextMenuSeparator />
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
      <RepoGroupDialog
        open={createGroupOpen}
        mode="create"
        onSubmit={(name) =>
          useRepoGroupsStore.getState().createGroup(name, [path])
        }
        onClose={() => setCreateGroupOpen(false)}
      />
    </>
  );
});
