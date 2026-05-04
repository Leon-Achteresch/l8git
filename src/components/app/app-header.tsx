import {
  Link,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, GitFork, Info, Settings, User } from "lucide-react";
import { type CSSProperties } from "react";

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

const IS_WIN =
  typeof navigator !== "undefined" &&
  /Windows/i.test(navigator.userAgent);

const NO_DRAG = {
  WebkitAppRegion: "no-drag",
} as CSSProperties;

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-14 shrink-0 select-none items-center gap-2 border-b px-3",
        IS_WIN
          ? "border-neutral-300/40 bg-[#f5f5f5] dark:border-border dark:bg-background/95"
          : "bg-background/80 backdrop-blur",
        IS_MAC && "pl-[78px]",
      )}
    >
      {IS_WIN ? (
        <div
          className="flex shrink-0 items-center gap-0.5 pr-1"
          style={NO_DRAG}
        >
          <button
            type="button"
            aria-label="Zurück"
            title="Zurück"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.06] dark:hover:bg-muted"
            onClick={() => router.history.back()}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Vor"
            title="Vor"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.06] dark:hover:bg-muted"
            onClick={() => router.history.forward()}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      ) : null}
      <nav className="flex shrink-0 items-center gap-0.5" style={NO_DRAG}>
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
                  ? IS_WIN
                    ? "bg-white text-foreground shadow-sm dark:bg-muted"
                    : "bg-muted text-foreground"
                  : IS_WIN
                    ? "text-muted-foreground hover:bg-black/[0.05] dark:hover:bg-muted/70"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      {IS_WIN ? (
        <div className="flex min-h-0 min-w-0 flex-1 justify-center px-2">
          <div className="w-full max-w-2xl min-w-0" style={NO_DRAG}>
            <AppHeaderBranchSelect layout="teams" />
          </div>
        </div>
      ) : (
        <>
          <AppHeaderBranchSelect layout="compact" />
          <div data-tauri-drag-region className="min-h-0 flex-1" />
        </>
      )}
      <Link
        to="/settings"
        aria-label="Einstellungen"
        title="Einstellungen"
        style={NO_DRAG}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          IS_WIN && "hover:bg-black/[0.06] dark:hover:bg-muted",
          pathname.startsWith("/settings") && "bg-muted text-foreground",
        )}
      >
        <Settings className="size-[1.125rem]" />
      </Link>
    </header>
  );
}
