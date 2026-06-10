import { Link, useRouterState } from "@tanstack/react-router";
import {
  GitFork,
  Info,
  LayoutDashboard,
  Settings,
  User,
} from "lucide-react";
import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { AppHeaderSearch } from "@/components/app/app-header-search";
import { WindowControls } from "@/components/app/window-controls";
import { RepoTabBar } from "@/components/repo/tabs/repo-tab-bar";
import { cn } from "@/lib/utils";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

const IS_WINDOWS =
  typeof navigator !== "undefined" && /Win/i.test(navigator.platform);

export function AppHeader() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = [
    { to: "/" as const, label: t("header.repo"), icon: GitFork },
    { to: "/dashboard" as const, label: t("header.dashboard"), icon: LayoutDashboard },
    { to: "/info" as const, label: t("header.info"), icon: Info },
    { to: "/about" as const, label: t("header.about"), icon: User },
  ] as const;

  return (
    <header
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
      className={cn(
        "relative z-10 flex h-10 shrink-0 select-none items-stretch gap-1",
        IS_MAC ? "pl-[86px]" : "pl-2",
      )}
    >
      <RepoTabBar />

      <div
        className="flex shrink-0 items-center gap-0.5 pr-1.5"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <AppHeaderSearch />

        <div className="mx-1 h-4 w-px bg-border/60" aria-hidden />

        <nav
          className="flex items-center gap-0.5"
          aria-label={t("header.mainNav")}
        >
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                title={label}
                aria-label={label}
                className={cn(
                  "relative inline-flex size-7 items-center justify-center rounded-md transition-all duration-150",
                  active
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={2} />
                {active && (
                  <span
                    className="pointer-events-none absolute bottom-0.5 left-2 right-2 h-[1.5px] rounded-full bg-primary/70"
                    aria-hidden
                  />
                )}
              </Link>
            );
          })}

          <div className="mx-0.5 h-4 w-px bg-border/60" aria-hidden />

          <Link
            to="/settings"
            aria-label={t("header.settingsAria")}
            title={t("header.settingsAria")}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all duration-150",
              "hover:bg-foreground/10 hover:text-foreground",
              pathname.startsWith("/settings") && "bg-foreground/10 text-foreground",
            )}
          >
            <Settings className="size-4" strokeWidth={2} />
          </Link>
        </nav>
      </div>

      {IS_WINDOWS && <WindowControls />}
    </header>
  );
}
