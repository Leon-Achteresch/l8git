import { Link, useRouterState } from "@tanstack/react-router";
import { GitFork, Info, Settings, User } from "lucide-react";
import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { AppHeaderSearch } from "@/components/app/app-header-search";
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
    { to: "/info" as const, label: t("header.info"), icon: Info },
    { to: "/about" as const, label: t("header.about"), icon: User },
  ] as const;

  return (
    <header
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
      className={cn(
        "relative flex shrink-0 select-none items-center gap-0 py-2",
        "border-b border-border/50",
        "bg-card/85 backdrop-blur-xl backdrop-saturate-150 dark:bg-background/70",
        IS_MAC && "pl-[72px]",
        IS_WINDOWS && "pr-[140px]",
      )}
    >
      <div
        data-tauri-drag-region
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
        className="flex-1 self-stretch"
      />

      {/* Centered search bar */}
      <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4">
        <div className="pointer-events-auto w-full max-w-[460px]">
          <AppHeaderSearch />
        </div>
      </div>

      <nav
        className="flex items-center gap-px px-1"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
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
                "relative inline-flex h-5 items-center gap-0.5 rounded px-1.5 text-[10px] font-medium leading-none transition-all duration-150",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={2} />
              {active && (
                <span
                  className="pointer-events-none absolute bottom-0 left-1 right-1 h-[1.5px] rounded-full bg-primary/70"
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
            "inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-all duration-150",
            "hover:bg-muted hover:text-foreground",
            pathname.startsWith("/settings") && "bg-muted text-foreground",
          )}
        >
          <Settings className="size-4" strokeWidth={2} />
        </Link>
      </nav>
    </header>
  );
}
