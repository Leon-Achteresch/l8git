import { ArrowDown, ArrowUp } from "lucide-react";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { ActivityCenter } from "@/components/app/activity-center";
import { AppHeader } from "@/components/app/app-header";
import { AppHeaderBranchSelect } from "@/components/app/app-header-branch-select";
import { AppHeaderSearch } from "@/components/app/app-header-search";
import { InboxHeaderButton } from "@/components/inbox/inbox-header-button";
import { AddRepoButton } from "@/components/repo/tabs/add-repo-button";
import { RepoTabBar } from "@/components/repo/tabs/repo-tab-bar";
import { RepoVerticalList } from "@/components/repo/tabs/repo-vertical-list";
import { RepoWorkspaceSwitch } from "@/components/repo/tabs/repo-workspace-switch";
import { useRepoWorkspaceSync } from "@/components/repo/tabs/use-repo-forest";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { useWorkspacePrefs, type ShellLayout } from "@/lib/workspace-prefs";

import {
  DRAG,
  IS_MAC,
  MacTrafficLightSpacer,
  NO_DRAG,
  ShellDivider,
  ShellTopBar,
} from "./shell-chrome";
import { MainNav, UtilityNav } from "./shell-nav";
import {
  ActiveRepoTitle,
  ActiveWorkspaceName,
  BreadcrumbSlash,
  RecentRepoPills,
  RepoExposeButton,
  RepoSwitcher,
  useTrackRecentRepos,
} from "./shell-repo-parts";

type ShellProps = { children: ReactNode };

/** Window chrome around the routed page; the arrangement follows the "shell layout" preference. */
export function AppShell({ children }: ShellProps) {
  useRepoWorkspaceSync();
  useTrackRecentRepos();
  const layout = useWorkspacePrefs((s) => s.shellLayout);
  const Layout = LAYOUTS[layout] ?? RailShell;
  return <Layout>{children}</Layout>;
}

const LAYOUTS: Record<ShellLayout, (props: ShellProps) => ReactNode> = {
  classic: ClassicShell,
  twoRow: TwoRowShell,
  rail: RailShell,
  breadcrumb: BreadcrumbShell,
  activityBar: ActivityBarShell,
  sidebar: SidebarShell,
  expose: ExposeShell,
  statusBar: StatusBarShell,
};

function ClassicShell({ children }: ShellProps) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}

/** A · app bar on top, full-width labeled repo tabs below. */
function TwoRowShell({ children }: ShellProps) {
  return (
    <>
      <ShellTopBar macInset className="h-11 gap-2 border-b-0 px-2">
        <div className="flex shrink-0 items-center gap-2" style={NO_DRAG}>
          <RepoWorkspaceSwitch />
          <MainNav variant="segmented" />
        </div>
        <div className="flex min-w-0 flex-1 justify-center" style={NO_DRAG}>
          <AppHeaderSearch variant="wide" />
        </div>
        <div className="flex shrink-0 items-center gap-0.5" style={NO_DRAG}>
          <ActivityCenter />
          <InboxHeaderButton />
          <ShellDivider vertical />
          <UtilityNav variant="header" />
        </div>
      </ShellTopBar>
      <div
        data-tauri-drag-region
        style={DRAG}
        className="relative z-10 flex h-10 shrink-0 select-none items-stretch border-b border-border/50 bg-sidebar pl-2"
      >
        <RepoTabBar variant="labeled" withWorkspaceSwitch={false} />
      </div>
      {children}
    </>
  );
}

/** B · Discord/Slack-style repo rail on the left (default). */
function RailShell({ children }: ShellProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        data-tauri-drag-region
        style={DRAG}
        className="flex w-16 shrink-0 select-none flex-col items-center gap-2 border-r border-border/50 bg-sidebar pb-2.5"
      >
        <MacTrafficLightSpacer className={IS_MAC ? "h-11" : "h-2.5"} />
        <div className="flex flex-col items-center gap-2" style={NO_DRAG}>
          <RepoWorkspaceSwitch />
          <ShellDivider />
        </div>
        <div className="flex min-h-0 w-full flex-1 flex-col items-center" style={NO_DRAG}>
          <RepoVerticalList style="rail" />
        </div>
        <div className="flex flex-col items-center gap-1" style={NO_DRAG}>
          <AddRepoButton />
          <ShellDivider />
          <UtilityNav variant="rail" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <ShellTopBar className={cn("h-12 gap-2 pr-2", IS_MAC ? "pl-6" : "pl-3")}>
          <div className="flex min-w-0 shrink items-center gap-2" style={NO_DRAG}>
            <ActiveRepoTitle />
            <AppHeaderBranchSelect />
          </div>
          <div className="flex min-w-0 flex-1 justify-center" style={NO_DRAG}>
            <AppHeaderSearch variant="wide" />
          </div>
          <div className="flex shrink-0 items-center gap-1" style={NO_DRAG}>
            <MainNav variant="segmented" />
            <ActivityCenter />
            <InboxHeaderButton />
          </div>
        </ShellTopBar>
        {children}
      </div>
    </div>
  );
}

/** C · Workspace / repo / branch breadcrumb with dropdown switchers. */
function BreadcrumbShell({ children }: ShellProps) {
  return (
    <>
      <ShellTopBar macInset className="h-12 gap-1 px-2">
        <div className="flex min-w-0 shrink items-center gap-1" style={NO_DRAG}>
          <RepoWorkspaceSwitch />
          <BreadcrumbSlash />
          <RepoSwitcher />
          <AddRepoButton />
          <BreadcrumbSlash />
          <AppHeaderBranchSelect />
        </div>
        <div className="flex min-w-0 flex-1 justify-center px-2" style={NO_DRAG}>
          <AppHeaderSearch variant="wide" />
        </div>
        <div className="flex shrink-0 items-center gap-0.5" style={NO_DRAG}>
          <ActivityCenter />
          <InboxHeaderButton />
          <ShellDivider vertical />
          <MainNav variant="icons" />
          <ShellDivider vertical />
          <UtilityNav variant="header" />
        </div>
      </ShellTopBar>
      {children}
    </>
  );
}

/** D · VS Code-style activity bar for navigation; the header only holds repo tabs. */
function ActivityBarShell({ children }: ShellProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        data-tauri-drag-region
        style={DRAG}
        className="flex w-[52px] shrink-0 select-none flex-col items-center gap-1 border-r border-border/50 bg-sidebar pb-2"
      >
        <MacTrafficLightSpacer />
        <div className="flex flex-col items-center gap-1" style={NO_DRAG}>
          <RepoWorkspaceSwitch />
          <ShellDivider />
          <MainNav variant="rail" />
          <ShellDivider />
          <InboxHeaderButton />
          <ActivityCenter />
        </div>
        <div className="flex-1" />
        <div className="flex flex-col items-center gap-1" style={NO_DRAG}>
          <AppHeaderSearch variant="icon" />
          <UtilityNav variant="rail" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <ShellTopBar className={cn("h-12 items-stretch", IS_MAC ? "pl-6" : "pl-2")}>
          <RepoTabBar variant="labeled" withWorkspaceSwitch={false} />
        </ShellTopBar>
        {children}
      </div>
    </div>
  );
}

/** E · one sidebar for workspace, search, navigation and repos. */
function SidebarShell({ children }: ShellProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        data-tauri-drag-region
        style={DRAG}
        className="flex w-60 shrink-0 select-none flex-col gap-1 border-r border-border/50 bg-sidebar px-2 pb-2"
      >
        <MacTrafficLightSpacer className={IS_MAC ? "h-11" : "h-2"} />
        <div className="flex min-h-0 flex-1 flex-col gap-1" style={NO_DRAG}>
          <div className="flex items-center gap-2 px-1 pb-1">
            <RepoWorkspaceSwitch />
            <ActiveWorkspaceName />
          </div>
          <div className="flex pb-1 [&>button]:max-w-none">
            <AppHeaderSearch variant="wide" />
          </div>
          <MainNav variant="list" />
          <div className="mt-2 flex items-center justify-between pl-2 pr-0.5">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("shellLayout.repositories")}
            </span>
            <AddRepoButton />
          </div>
          <RepoVerticalList style="list" />
        </div>
        <div className="flex items-center gap-0.5 border-t border-border/50 pt-2" style={NO_DRAG}>
          <ActivityCenter />
          <InboxHeaderButton />
          <div className="flex-1" />
          <UtilityNav variant="list" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <ShellTopBar className="h-11 gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2" style={NO_DRAG}>
            <ActiveRepoTitle />
            <AppHeaderBranchSelect />
          </div>
        </ShellTopBar>
        {children}
      </div>
    </div>
  );
}

/** F · active and recent repos in the header, everything else in a full-window overview. */
function ExposeShell({ children }: ShellProps) {
  return (
    <>
      <ShellTopBar macInset className="h-12 gap-1.5 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5" style={NO_DRAG}>
          <RepoWorkspaceSwitch />
          <RecentRepoPills />
          <RepoExposeButton />
          <AddRepoButton />
        </div>
        <div className="flex shrink-0 items-center gap-0.5" style={NO_DRAG}>
          <AppHeaderSearch />
          <ActivityCenter />
          <InboxHeaderButton />
          <ShellDivider vertical />
          <MainNav variant="icons" />
          <ShellDivider vertical />
          <UtilityNav variant="header" />
        </div>
      </ShellTopBar>
      {children}
    </>
  );
}

/** G · flat labeled tabs on top, navigation and repo status in a bottom status bar. */
function StatusBarShell({ children }: ShellProps) {
  return (
    <>
      <ShellTopBar macInset className="h-11 items-stretch gap-1 pl-2">
        <RepoTabBar variant="flat" />
        <div className="flex shrink-0 items-center pr-1.5" style={NO_DRAG}>
          <AppHeaderSearch variant="icon" />
        </div>
      </ShellTopBar>
      {children}
      <footer
        className="flex h-7 shrink-0 select-none items-center gap-0.5 border-t border-border/50 bg-sidebar px-1.5 text-[0.6875rem] text-muted-foreground"
      >
        <MainNav variant="status" />
        <ShellDivider vertical />
        <AppHeaderBranchSelect className="h-5 border-0 bg-transparent px-1 text-[0.6875rem]" />
        <ActiveRepoSyncText />
        <div className="flex-1" />
        <ActivityCenter />
        <InboxHeaderButton />
        <UtilityNav variant="status" />
      </footer>
    </>
  );
}

function ActiveRepoSyncText() {
  const { t } = useTranslation();
  const { ahead, behind } = useRepoStore(
    useShallow((s) => {
      const p = s.activePath;
      const sync = p && s.hasUpstream[p] ? s.upstreamSync[p] : undefined;
      return { ahead: sync?.ahead ?? 0, behind: sync?.behind ?? 0 };
    }),
  );
  if (!ahead && !behind) return null;
  return (
    <span className="inline-flex items-center gap-2 px-1.5">
      {ahead > 0 && (
        <span className="inline-flex items-center gap-0.5 text-git-branch">
          <ArrowUp className="size-3" aria-hidden />
          {t("shellLayout.ahead", { count: ahead })}
        </span>
      )}
      {behind > 0 && (
        <span className="inline-flex items-center gap-0.5 text-git-removed">
          <ArrowDown className="size-3" aria-hidden />
          {t("shellLayout.behind", { count: behind })}
        </span>
      )}
    </span>
  );
}
