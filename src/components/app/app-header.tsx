import { ActivityCenter } from "./activity-center";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  GitFork,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { InboxHeaderButton } from "@/components/inbox/inbox-header-button";
import { AppHeaderSearch } from "@/components/app/app-header-search";
import { WindowControls } from "@/components/app/window-controls";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { RepoTabBar } from "@/components/repo/tabs/repo-tab-bar";
import { cn } from "@/lib/utils";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

const IS_WINDOWS =
  typeof navigator !== "undefined" && /Win/i.test(navigator.platform);

export function AppHeader() {
  const { t } = useTranslation();
  const navLabels = useWorkspacePrefs(s => s.navLabels);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = [
    { to: "/" as const, label: t("header.repo"), icon: GitFork },
    { to: "/dashboard" as const, label: t("header.dashboard"), icon: LayoutDashboard },
  ] as const;

  return (
    <header
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
      className={cn(
        "relative z-10 flex h-12 shrink-0 select-none items-stretch gap-1 overflow-hidden border-b border-border/50 bg-sidebar",
        IS_MAC ? "pl-[86px]" : "pl-2",
        IS_WINDOWS && "pr-[140px]",
      )}
    >
      <RepoTabBar />

      <div
        className="flex shrink-0 items-center gap-0.5 pr-1.5"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <AppHeaderSearch />
        <ActivityCenter />
        <InboxHeaderButton />

        <div className="mx-1 h-4 w-px bg-border/60" aria-hidden />

        <nav
          className="flex items-center gap-0.5"
          aria-label={t("header.mainNav")}
        >
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Tooltip key={to} delayDuration={300}>
                <TooltipTrigger asChild>
                  <Link
                    to={to}
                    title={label}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative inline-flex size-8 items-center justify-center rounded-xl transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
                      navLabels && "xl:w-auto xl:gap-1.5 xl:px-2",
                      active
                        ? "bg-muted text-foreground shadow-xs ring-1 ring-border/50"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    {navLabels && <span className="hidden text-xs xl:inline">{label}</span>}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute -bottom-[7px] left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-foreground/70"
                      />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>
                  <span className="font-medium">{label}</span>
                </TooltipContent>
              </Tooltip>
            );
          })}

          <div className="mx-0.5 h-4 w-px bg-border/60" aria-hidden />

          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Link
                to="/settings"
                aria-label={t("header.settingsAria")}
                title={t("header.settingsAria")}
                aria-current={pathname.startsWith("/settings") ? "page" : undefined}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
                  "hover:bg-muted/70 hover:text-foreground",
                  pathname.startsWith("/settings") && "bg-muted text-foreground shadow-xs ring-1 ring-border/50",
                )}
              >
                <Settings className="size-4" strokeWidth={1.75} aria-hidden />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <span className="inline-flex items-center gap-1.5 font-medium">
                {t("header.settingsAria")}
                <Kbd className="h-4 px-1 text-[0.625rem]">⌘,</Kbd>
              </span>
            </TooltipContent>
          </Tooltip>
        </nav>
      </div>

      {IS_WINDOWS && <WindowControls />}
    </header>
  );
}
