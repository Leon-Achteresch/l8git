import {
  Check,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  GitBranch,
  ListTree,
  Minimize2,
  Maximize2,
  PictureInPicture2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import {
  DynamicIsland,
  DynamicIslandView,
} from "@/components/motion/dynamic-island";
import { IslandActionsView } from "@/components/island/island-actions-view";
import { IslandChatView } from "@/components/island/island-chat-view";
import {
  ActivityBars,
  FlashIcon,
  ISLAND_ICON,
  ISLAND_ROW,
  ISLAND_VIEW,
  type IslandFlash,
} from "@/components/island/island-ui";
import { RepoLogo } from "@/components/repo/repo-logo";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { AGENT_INTEGRATIONS } from "@/lib/agent-integrations";
import { runIslandActionWithFlash } from "@/lib/island/flash";
import { useIslandStore } from "@/lib/island-store";
import { activeRepoOf, type IslandSnapshot } from "@/lib/island/types";
import { cn } from "@/lib/utils";

export type IslandShellProps = {
  snapshot: IslandSnapshot;
  view: string | null;
  onViewChange: (view: string | null) => void;
  /** Transient status line shown instead of the pill. */
  flash?: IslandFlash | null;
  /** Returns false while a drag is in flight so it does not read as a click. */
  canInteract?: () => boolean;
  /** Rendered inside its own window — position controls do not apply. */
  standalone?: boolean;
  className?: string;
};

/**
 * The island itself: the pill plus every view it can unfurl into. Shared by the
 * in-app overlay and the detached window so both surfaces stay identical.
 */
export function IslandShell({
  snapshot,
  view,
  onViewChange,
  flash = null,
  canInteract,
  standalone = false,
  className,
}: IslandShellProps) {
  const { t } = useTranslation();
  const [menuPage, setMenuPage] = useState<"root" | "integrations">("root");

  const { showBranch, showDirty, showAgents } = useIslandStore(
    useShallow((s) => ({
      showBranch: s.showBranch,
      showDirty: s.showDirty,
      showAgents: s.showAgents,
    })),
  );
  const toggleBranch = useIslandStore((s) => s.toggleBranch);
  const toggleDirty = useIslandStore((s) => s.toggleDirty);
  const toggleAgents = useIslandStore((s) => s.toggleAgents);
  const resetPosition = useIslandStore((s) => s.resetPosition);

  // Re-entering the menu always starts on its root page.
  useEffect(() => {
    if (view === ISLAND_VIEW.menu) setMenuPage("root");
  }, [view]);

  const idle = () => (canInteract ? canInteract() : true);
  const close = () => onViewChange(null);
  const active = activeRepoOf(snapshot);
  const busyAgents = active?.busy ?? [];
  const primaryBusy = AGENT_INTEGRATIONS.find((i) => i.id === busyAgents[0]);
  const PrimaryBusyIcon = primaryBusy?.icon;

  const run = (actionId: string, label: string) => {
    void runIslandActionWithFlash({ actionId }, label);
    close();
  };

  const resolved =
    view ??
    (flash
      ? ISLAND_VIEW.toast
      : showAgents && busyAgents.length > 0
        ? ISLAND_VIEW.agent
        : null);

  return (
    <DynamicIsland
      view={resolved}
      className={className}
      compact={
        <span className="flex min-w-[110px] max-w-[240px] items-center gap-1.5">
          <ListRow
            onClick={() => {
              if (!idle()) return;
              onViewChange(ISLAND_VIEW.projects);
            }}
            aria-label={t("island.open")}
            className={cn(ISLAND_ROW, "min-w-0 flex-1 px-0")}
          >
            {active && (
              <RepoLogo
                path={active.path}
                label={active.label}
                className="size-4 text-[8px]"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-left">
              {active?.label ?? t("islandChat.title")}
            </span>
            {showDirty && (active?.dirty ?? 0) > 0 && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-git-modified"
                title={t("island.dirty", { count: active?.dirty ?? 0 })}
              />
            )}
            {showAgents && (active?.running.length ?? 0) > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
                {AGENT_INTEGRATIONS.filter((i) =>
                  active?.running.includes(i.id),
                ).map((i) => (
                  <i.icon key={i.id} className="size-3" />
                ))}
              </span>
            )}
          </ListRow>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              if (!idle()) return;
              onViewChange(ISLAND_VIEW.chat);
            }}
            aria-label={t("island.chat")}
            title={t("island.chat")}
            className={ISLAND_ICON}
          >
            <Sparkles />
          </Button>
        </span>
      }
    >
      <DynamicIslandView id={ISLAND_VIEW.agent} className="!px-3 !py-2">
        <ListRow
          onClick={() => {
            if (!idle()) return;
            onViewChange(ISLAND_VIEW.projects);
          }}
          className={cn(ISLAND_ROW, "w-[240px] gap-2.5 px-0")}
        >
          {PrimaryBusyIcon && <PrimaryBusyIcon className="size-4 shrink-0" />}
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-xs font-medium">
              {primaryBusy?.label}
            </span>
            <span className="truncate text-[10px] opacity-55">
              {t("island.working", { repo: active?.label ?? "" })}
            </span>
          </span>
          <ActivityBars />
        </ListRow>
      </DynamicIslandView>

      <DynamicIslandView id={ISLAND_VIEW.toast} className="!px-3 !py-2">
        <div className="flex w-[280px] items-center gap-2.5">
          <FlashIcon type={flash?.type} />
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-xs font-medium">{flash?.title}</span>
            {flash?.description ? (
              <span className="truncate text-[10px] opacity-55">
                {flash.description}
              </span>
            ) : null}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => flash?.onDismiss?.()}
            aria-label={t("island.close")}
            className={ISLAND_ICON}
          >
            <X />
          </Button>
        </div>
      </DynamicIslandView>

      <DynamicIslandView id={ISLAND_VIEW.projects} className="!px-2 !py-2">
        <div className="flex w-[300px] flex-col">
          <div className="flex items-center justify-between px-2 pb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider opacity-50">
              {t("island.projects", { count: snapshot.repos.length })}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={close}
              aria-label={t("island.close")}
              className={ISLAND_ICON}
            >
              <X />
            </Button>
          </div>

          <div className="max-h-64 min-h-0 overflow-y-auto [scrollbar-width:thin]">
            {snapshot.repos.map((repo) => {
              const isActive = repo.path === snapshot.activePath;
              return (
                <ListRow
                  key={repo.path}
                  active={isActive}
                  onClick={() => {
                    void runIslandActionWithFlash(
                      { actionId: "repo.activate", path: repo.path, args: { path: repo.path } },
                      repo.label,
                    );
                    close();
                  }}
                  title={repo.path}
                  className={ISLAND_ROW}
                >
                  <span
                    className={cn(
                      "h-6 w-0.5 shrink-0 rounded-full",
                      isActive ? "bg-git-added" : "bg-transparent",
                    )}
                  />
                  <RepoLogo path={repo.path} label={repo.label} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium">{repo.label}</span>
                    {showBranch && (
                      <span className="flex items-center gap-1 text-[10px] opacity-55">
                        <GitBranch className="size-2.5 shrink-0" />
                        <span className="truncate">{repo.branch || "—"}</span>
                      </span>
                    )}
                  </span>
                  {showDirty && repo.dirty > 0 && (
                    <span className="shrink-0 rounded-full bg-git-modified/20 px-1.5 py-0.5 text-[10px] font-medium text-git-modified">
                      {repo.dirty}
                    </span>
                  )}
                  {showAgents &&
                    AGENT_INTEGRATIONS.filter((i) => repo.running.includes(i.id)).map(
                      (i) => (
                        <span key={i.id} className="flex shrink-0 items-center">
                          <i.icon className="size-3" />
                        </span>
                      ),
                    )}
                  {showAgents && repo.busy.length > 0 && (
                    <ActivityBars className="h-2.5" />
                  )}
                </ListRow>
              );
            })}
          </div>

          <div className="mt-1.5 flex items-center gap-1 border-t border-background/10 px-1 pt-1.5">
            <ListRow
              size="sm"
              onClick={() => onViewChange(ISLAND_VIEW.chat)}
              className={cn(ISLAND_ROW, "flex-1 justify-center gap-1.5 font-medium")}
            >
              <Sparkles />
              <span className="truncate">{t("island.chat")}</span>
            </ListRow>
            <ListRow
              size="sm"
              onClick={() => onViewChange(ISLAND_VIEW.actions)}
              className={cn(ISLAND_ROW, "flex-1 justify-center gap-1.5 font-medium")}
            >
              <ListTree />
              <span className="truncate">{t("island.actions")}</span>
            </ListRow>
          </div>
        </div>
      </DynamicIslandView>

      <DynamicIslandView id={ISLAND_VIEW.chat} className="!px-2 !py-2">
        <IslandChatView
          snapshot={snapshot}
          onClose={close}
          onBack={() => onViewChange(ISLAND_VIEW.projects)}
        />
      </DynamicIslandView>

      <DynamicIslandView id={ISLAND_VIEW.actions} className="!px-2 !py-2">
        <IslandActionsView
          snapshot={snapshot}
          onClose={close}
          onBack={() => onViewChange(ISLAND_VIEW.projects)}
        />
      </DynamicIslandView>

      <DynamicIslandView id={ISLAND_VIEW.menu} className="!px-2 !py-2">
        <div className="flex w-[260px] flex-col">
          {menuPage === "root" ? (
            <>
              <div className="flex items-center justify-between px-2 pb-1.5">
                <span className="truncate text-xs font-medium">
                  {active?.label ?? "l8git"}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={close}
                  aria-label={t("island.close")}
                  className={ISLAND_ICON}
                >
                  <X />
                </Button>
              </div>

              <ListRow
                size="sm"
                onClick={() => onViewChange(ISLAND_VIEW.projects)}
                className={ISLAND_ROW}
              >
                <FolderGit2 className="opacity-70" />
                <span className="flex-1 truncate">
                  {t("island.projects", { count: snapshot.repos.length })}
                </span>
              </ListRow>

              <ListRow
                size="sm"
                onClick={() => onViewChange(ISLAND_VIEW.chat)}
                className={ISLAND_ROW}
              >
                <Sparkles className="opacity-70" />
                <span className="flex-1 truncate">{t("island.chat")}</span>
              </ListRow>

              <ListRow
                size="sm"
                onClick={() => onViewChange(ISLAND_VIEW.actions)}
                className={ISLAND_ROW}
              >
                <ListTree className="opacity-70" />
                <span className="flex-1 truncate">{t("island.actions")}</span>
              </ListRow>

              <ListRow
                size="sm"
                onClick={() => setMenuPage("integrations")}
                className={ISLAND_ROW}
              >
                <span className="flex-1 truncate">{t("island.integrations")}</span>
                <ChevronRight className="opacity-50" />
              </ListRow>

              <div className="my-1 border-t border-background/10" />

              <span className="px-2 pb-0.5 text-[10px] font-medium uppercase tracking-wider opacity-50">
                {t("island.window")}
              </span>

              {snapshot.detached ? (
                <ListRow
                  size="sm"
                  onClick={() => run("window.attach", t("islandActions.attachIsland"))}
                  className={ISLAND_ROW}
                >
                  <PictureInPicture2 className="opacity-70" />
                  <span className="flex-1 truncate">
                    {t("islandActions.attachIsland")}
                  </span>
                </ListRow>
              ) : (
                <ListRow
                  size="sm"
                  onClick={() => run("window.detach", t("islandActions.detachIsland"))}
                  className={ISLAND_ROW}
                >
                  <PictureInPicture2 className="opacity-70" />
                  <span className="flex-1 truncate">
                    {t("islandActions.detachIsland")}
                  </span>
                </ListRow>
              )}

              {snapshot.mainMinimized ? (
                <ListRow
                  size="sm"
                  onClick={() => run("window.restore", t("islandActions.restoreApp"))}
                  className={ISLAND_ROW}
                >
                  <Maximize2 className="opacity-70" />
                  <span className="flex-1 truncate">
                    {t("islandActions.restoreApp")}
                  </span>
                </ListRow>
              ) : (
                <ListRow
                  size="sm"
                  onClick={() => run("window.minimize", t("islandActions.minimizeApp"))}
                  className={ISLAND_ROW}
                >
                  <Minimize2 className="opacity-70" />
                  <span className="flex-1 truncate">
                    {t("islandActions.minimizeApp")}
                  </span>
                </ListRow>
              )}

              <div className="my-1 border-t border-background/10" />

              <span className="px-2 pb-0.5 text-[10px] font-medium uppercase tracking-wider opacity-50">
                {t("island.display")}
              </span>

              <ToggleRow label={t("island.showBranch")} checked={showBranch} onClick={toggleBranch} />
              <ToggleRow label={t("island.showDirty")} checked={showDirty} onClick={toggleDirty} />
              <ToggleRow label={t("island.showAgents")} checked={showAgents} onClick={toggleAgents} />

              {!standalone && (
                <>
                  <div className="my-1 border-t border-background/10" />
                  <ListRow
                    size="sm"
                    onClick={() => {
                      resetPosition();
                      close();
                    }}
                    className={ISLAND_ROW}
                  >
                    <RotateCcw className="opacity-70" />
                    <span className="flex-1 truncate">{t("island.resetPosition")}</span>
                  </ListRow>
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 px-1 pb-1.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setMenuPage("root")}
                  aria-label={t("common.back")}
                  className={ISLAND_ICON}
                >
                  <ChevronLeft />
                </Button>
                <span className="flex-1 truncate text-xs font-medium">
                  {t("island.integrations")}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={close}
                  aria-label={t("island.close")}
                  className={ISLAND_ICON}
                >
                  <X />
                </Button>
              </div>

              {AGENT_INTEGRATIONS.map((integration) => (
                <ListRow
                  key={integration.id}
                  size="sm"
                  onClick={() => {
                    void runIslandActionWithFlash(
                      {
                        actionId: "agent.launch",
                        args: { integrationId: integration.id },
                      },
                      integration.label,
                    );
                    close();
                  }}
                  className={ISLAND_ROW}
                >
                  <integration.icon />
                  <span className="flex-1 truncate">{integration.label}</span>
                  {active?.running.includes(integration.id) && (
                    <span className="size-1.5 shrink-0 rounded-full bg-git-added" />
                  )}
                </ListRow>
              ))}
            </>
          )}
        </div>
      </DynamicIslandView>
    </DynamicIsland>
  );
}

function ToggleRow({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <ListRow
      size="sm"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className={ISLAND_ROW}
    >
      <span
        aria-hidden
        className="flex size-3.5 shrink-0 items-center justify-center"
      >
        {checked && <Check className="size-3" />}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </ListRow>
  );
}
