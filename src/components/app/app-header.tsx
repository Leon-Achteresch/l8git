import { Link, useRouterState } from "@tanstack/react-router";
import { GitFork, Info, Settings, User } from "lucide-react";

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
        "flex h-10 shrink-0 select-none items-center gap-1 border-b bg-background/80 px-2 backdrop-blur",
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
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div data-tauri-drag-region className="flex-1" />
      <Link
        to="/settings"
        aria-label="Einstellungen"
        title="Einstellungen"
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          pathname.startsWith("/settings") && "bg-muted text-foreground",
        )}
      >
        <Settings className="size-4" />
      </Link>
    </header>
  );
}
