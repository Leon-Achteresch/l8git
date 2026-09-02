import {
  Archive,
  ArrowDownToLine,
  ArrowUpToLine,
  Bot,
  ChevronLeft,
  CloudDownload,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  PictureInPicture2,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { ISLAND_ICON, ISLAND_ROW } from "@/components/island/island-ui";
import { RepoLogo } from "@/components/repo/repo-logo";
import {
  listedIslandActions,
  searchIslandActions,
  type IslandActionDef,
  type IslandActionGroup,
} from "@/lib/island/actions";
import { runIslandActionWithFlash } from "@/lib/island/flash";
import { activeRepoOf, type IslandActionArgs, type IslandSnapshot } from "@/lib/island/types";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string }>;

const GROUP_ICON: Record<IslandActionGroup, Icon> = {
  git: GitCommitHorizontal,
  view: LayoutDashboard,
  repo: FolderGit2,
  agents: Bot,
  window: Minimize2,
};

const ACTION_ICON: Record<string, Icon> = {
  "git.push": ArrowUpToLine,
  "git.pull": ArrowDownToLine,
  "git.fetch": CloudDownload,
  "git.stageAll": Plus,
  "git.unstageAll": Minus,
  "git.checkout": GitBranch,
  "git.createBranch": GitBranchPlus,
  "git.stash": Archive,
  "git.refresh": RotateCcw,
  "view.terminal": Terminal,
  "repo.terminal": Terminal,
  "repo.ide": ExternalLink,
  "window.minimize": Minimize2,
  "window.restore": Maximize2,
  "window.detach": PictureInPicture2,
  "window.attach": PictureInPicture2,
};

const GROUP_ORDER: IslandActionGroup[] = ["git", "agents", "repo", "view", "window"];

function iconOf(action: IslandActionDef): Icon {
  return ACTION_ICON[action.id] ?? GROUP_ICON[action.group];
}

export function IslandActionsView({
  snapshot,
  onClose,
  onOpenProjects,
  onOpenChat,
  onOpenMenu,
}: {
  snapshot: IslandSnapshot;
  onClose: () => void;
  onOpenProjects: () => void;
  onOpenChat: () => void;
  onOpenMenu: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<IslandActionDef | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const active = activeRepoOf(snapshot);

  const label = (action: IslandActionDef) => t(`islandActions.${action.labelKey}`);

  const available = useMemo(() => {
    const detached = snapshot.detached;
    const searching = query.trim().length > 0;
    return listedIslandActions().filter((action) => {
      if (action.needsRepo && !snapshot.activePath) return false;
      if (action.id === "window.detach" && detached) return false;
      if (action.id === "window.attach" && !detached) return false;
      if (action.id === "repo.activate") return false;
      if (action.id === "agent.launch") return false;
      if (action.id === "view.agents") return false;
      if (!searching && (action.group === "view" || action.group === "window")) return false;
      return true;
    });
  }, [query, snapshot.activePath, snapshot.detached]);

  const matches = useMemo(
    () => searchIslandActions(available, query, label),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [available, query, t],
  );

  const grouped = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        items: matches.filter((action) => action.group === group),
      })).filter((entry) => entry.items.length > 0),
    [matches],
  );

  const run = (action: IslandActionDef, args?: IslandActionArgs) => {
    void runIslandActionWithFlash({ actionId: action.id, args }, label(action));
    setPending(null);
    setValues({});
    onClose();
  };

  const select = (action: IslandActionDef) => {
    const stringArgs = (action.args ?? []).filter((arg) => arg.type === "string");
    if (stringArgs.length === 0) {
      run(action);
      return;
    }
    setValues(Object.fromEntries(stringArgs.map((arg) => [arg.name, ""])));
    setPending(action);
  };

  if (pending) {
    const stringArgs = (pending.args ?? []).filter((arg) => arg.type === "string");
    const missing = stringArgs.some(
      (arg) => arg.required && !values[arg.name]?.trim(),
    );
    const submit = () => {
      if (missing) return;
      const args: IslandActionArgs = {};
      for (const arg of stringArgs) {
        const value = values[arg.name]?.trim();
        if (value) args[arg.name] = value;
      }
      run(pending, args);
    };
    return (
      <div className="flex h-full w-full flex-col gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setPending(null)}
            aria-label={t("common.back")}
            className={ISLAND_ICON}
          >
            <ChevronLeft />
          </Button>
          <span className="flex-1 truncate text-xs font-medium">
            {label(pending)}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label={t("island.close")}
            className={ISLAND_ICON}
          >
            <X />
          </Button>
        </div>
        {stringArgs.map((arg, index) => (
          <input
            key={arg.name}
            autoFocus={index === 0}
            value={values[arg.name] ?? ""}
            placeholder={t(`islandActions.arg.${arg.name}`, arg.name)}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="w-full rounded-md bg-background/10 px-2 py-1.5 text-xs outline-none placeholder:opacity-40 focus:bg-background/15"
          />
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={missing}
          onClick={submit}
          className={cn(ISLAND_ROW, "justify-center font-medium")}
        >
          {t("islandActions.run")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-1 px-1 pb-1.5">
        <ListRow
          onClick={onOpenProjects}
          className={cn(ISLAND_ROW, "min-w-0 flex-1 gap-1.5 px-1")}
        >
          {active && (
            <RepoLogo
              path={active.path}
              label={active.label}
              className="size-4 text-[8px]"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">
            {active?.label ?? t("island.projects", { count: snapshot.repos.length })}
          </span>
        </ListRow>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onOpenChat}
          aria-label={t("island.chat")}
          title={t("island.chat")}
          className={ISLAND_ICON}
        >
          <Sparkles />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onOpenMenu}
          aria-label={t("island.menu")}
          title={t("island.menu")}
          className={ISLAND_ICON}
        >
          <MoreHorizontal />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label={t("island.close")}
          className={ISLAND_ICON}
        >
          <X />
        </Button>
      </div>

      <div className="flex items-center gap-1.5 px-2 pb-1.5">
        <Search className="size-3 shrink-0 opacity-50" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("islandActions.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:opacity-40"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {grouped.length === 0 && (
          <p className="px-2 py-3 text-center text-[11px] opacity-50">
            {t("islandActions.empty")}
          </p>
        )}
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <span className="block px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider opacity-50">
              {t(`islandActions.group.${group}`)}
            </span>
            {items.map((action) => {
              const ActionIcon = iconOf(action);
              return (
                <ListRow
                  key={action.id}
                  size="sm"
                  onClick={() => select(action)}
                  className={ISLAND_ROW}
                >
                  <ActionIcon className="opacity-70" />
                  <span className="flex-1 truncate">{label(action)}</span>
                  {action.writes && (
                    <span className="size-1.5 shrink-0 rounded-full bg-git-modified/70" />
                  )}
                </ListRow>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
