import { Link, useRouterState } from "@tanstack/react-router";
import { GitFork, Info, Settings, User } from "lucide-react";

import { AppHeaderBranchSelect } from "@/components/app/app-header-branch-select";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Repository", icon: GitFork },
  { to: "/info", label: "Info", icon: Info },
  { to: "/about", label: "About", icon: User },
] as const;

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-14 shrink-0 select-none items-center gap-2 border-b bg-background/80 px-3 backdrop-blur",
        IS_MAC && "pl-[78px]",
      )}
    >
      <nav className="flex items-center gap-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      {/* <AppHeaderBranchSelect /> */}
      <div data-tauri-drag-region className="flex-1" />
      <Link
        to="/settings"
        aria-label="Einstellungen"
        title="Einstellungen"
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          pathname.startsWith("/settings") && "bg-muted text-foreground",
        )}
      >
        <Settings className="size-[1.125rem]" />
      </Link>
    </header>
  );
}
