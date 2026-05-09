import { Link, useRouterState } from "@tanstack/react-router";
import { GitFork, Info, Settings, User } from "lucide-react";
import { type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { AppHeaderBranchSelect } from "./app-header-branch-select";

const NAV_ITEMS = [
  { to: "/", label: "Repository", icon: GitFork },
  { to: "/info", label: "Info", icon: Info },
  { to: "/about", label: "About", icon: User },
] as const;

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

const IS_WINDOWS =
  typeof navigator !== "undefined" && /Win/i.test(navigator.platform);

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
      className={cn(
        "relative flex shrink-0 select-none items-center gap-0 py-1",
        "border-b border-border/50",
        "bg-background/70 backdrop-blur-xl backdrop-saturate-150",
        IS_MAC && "pl-[72px]",
        IS_WINDOWS && "pr-[140px]",
      )}
    >
      <div
        className="flex shrink-0 items-center pl-2 pr-0.5"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <AppHeaderBranchSelect />
      </div>

      <div
        data-tauri-drag-region
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
        className="flex-1 self-stretch"
      />

      <nav
        className="flex items-center gap-px px-1"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        aria-label="Hauptnavigation"
      >
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
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
              <Icon className="size-2.5 shrink-0" strokeWidth={2} />
              <span className="hidden sm:inline">{label}</span>
              {active && (
                <span
                  className="pointer-events-none absolute bottom-0 left-1 right-1 h-[1.5px] rounded-full bg-primary/70"
                  aria-hidden
                />
              )}
            </Link>
          );
        })}

        <div className="mx-0.5 h-2.5 w-px bg-border/60" aria-hidden />

        <Link
          to="/settings"
          aria-label="Einstellungen"
          title="Einstellungen"
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-all duration-150",
            "hover:bg-muted hover:text-foreground",
            pathname.startsWith("/settings") && "bg-muted text-foreground",
          )}
        >
          <Settings className="size-2.5" strokeWidth={2} />
        </Link>
      </nav>
    </header>
  );
}
